import fs from 'fs-extra';
import readline from 'readline';
import chalk from 'chalk';
import {
  loadSourcesRegistry,
  addSourceEntry,
  removeSourceEntry,
  getSourceEntry,
  updateSourceEntry,
  deriveSourceName,
  validateSourceUrl,
  normalizeSourceUrl,
} from '../core/sources.js';
import { cloneOrPull, cloneOrPullWithStatus } from '../sources/git.js';
import { scanSourceRepo } from '../sources/scanner.js';
import { sourceRepoDir } from '../fs/paths.js';
import { importSingleSkill, checkSkillConflict } from './_import-helpers.js';
import { formatTable } from '../utils/table.js';
import { SourceError, SourceNotFoundError } from '../utils/errors.js';

export async function sourceAddCommand(
  url: string,
  opts: { install?: boolean; slugs?: string[]; force?: boolean },
): Promise<void> {
  validateSourceUrl(url);

  const name = deriveSourceName(url);

  // If already exists, check URL matches (normalized to ignore .git suffix / trailing slash)
  const existing = await getSourceEntry(name);
  if (existing) {
    if (normalizeSourceUrl(existing.url) !== normalizeSourceUrl(url)) {
      throw new SourceError(
        `Source "${name}" already exists with a different URL (${existing.url}). ` +
          `Remove it first with \`sm source remove ${name}\`, then add the new one.`,
      );
    }
    console.log(chalk.dim(`Source "${name}" already exists. Syncing...`));
    if (!opts.install) {
      await sourceSyncCommand({ name });
      return;
    }
    // When --install is set, fall through to sync + install below
  } else {
    console.log(chalk.bold(`Adding source "${name}"...`));
  }

  // Use stored URL for existing sources to avoid SSH↔HTTPS mismatch in git layer
  const gitUrl = existing ? existing.url : url;
  const { dir } = await cloneOrPullWithStatus(gitUrl);
  const skills = await scanSourceRepo(dir, name, gitUrl);

  if (!existing) {
    await addSourceEntry({
      name,
      url,
      addedAt: new Date().toISOString(),
      lastSync: new Date().toISOString(),
      skillCount: skills.length,
    });
  } else {
    await updateSourceEntry(name, {
      lastSync: new Date().toISOString(),
      skillCount: skills.length,
    });
  }

  if (skills.length > 0) {
    const table = formatTable(
      skills.map((s) => ({
        slug: s.slug,
        name: s.name,
        status: s.installed ? chalk.green('installed') : chalk.dim('available'),
      })),
      [
        { header: 'Slug', key: 'slug' },
        { header: 'Name', key: 'name' },
        { header: 'Status', key: 'status' },
      ],
    );
    console.log(`\n${table}`);
  }

  if (opts.install) {
    // Determine which skills to install
    let toInstall = skills;
    if (opts.slugs && opts.slugs.length > 0) {
      const available = new Set(skills.map((s) => s.slug));
      const missing = opts.slugs.filter((s) => !available.has(s));
      if (missing.length > 0) {
        throw new SourceError(
          `Skills not found in "${name}": ${missing.join(', ')}. ` + `Available: ${[...available].join(', ')}`,
        );
      }
      const requested = new Set(opts.slugs);
      toInstall = skills.filter((s) => requested.has(s.slug));
    }

    let installed = 0;
    let updated = 0;
    for (const skill of toInstall) {
      try {
        const content = await fs.readFile(skill.filePath, 'utf-8');

        if (skill.installed) {
          const status = await checkSkillConflict(skill.slug, content);
          if (status === 'identical') {
            console.log(chalk.dim(`  ○ ${skill.slug} (up to date)`));
            continue;
          }
          // Content has changed — prompt unless forced
          if (!opts.force) {
            const approved = await confirmUpdate(skill.slug);
            if (!approved) {
              console.log(chalk.dim(`  ○ ${skill.slug} (skipped)`));
              continue;
            }
          }
          console.log(chalk.cyan(`  ↻ updating ${skill.slug}`));
        }

        await importSingleSkill({
          slug: skill.slug,
          content,
          source: { type: 'git', repo: gitUrl, originalPath: skill.filePath },
        });
        if (skill.installed) {
          updated++;
        } else {
          installed++;
        }
      } catch (err) {
        console.log(chalk.yellow(`  ⚠ Failed to install ${skill.slug}: ${err instanceof Error ? err.message : err}`));
      }
    }
    const parts: string[] = [];
    if (installed > 0) parts.push(`${installed} installed`);
    if (updated > 0) parts.push(`${updated} updated`);
    const filterNote = opts.slugs?.length
      ? ` (${toInstall.length} selected${parts.length ? ', ' + parts.join(', ') : ''})`
      : parts.length
        ? ` (${parts.join(', ')})`
        : '';
    console.log(chalk.green(`\n✓ Added source "${name}" with ${skills.length} skills${filterNote}`));
  } else {
    console.log(chalk.green(`\n✓ Added source "${name}" with ${skills.length} skills`));
  }
}

export async function sourceListCommand(opts: { json?: boolean }): Promise<void> {
  const registry = await loadSourcesRegistry();

  if (opts.json) {
    process.stdout.write(JSON.stringify(registry.sources, null, 2) + '\n');
    return;
  }

  if (registry.sources.length === 0) {
    console.log(chalk.dim('No sources configured. Use `sm source add <url>` to add one.'));
    return;
  }

  const table = formatTable(
    registry.sources.map((s) => ({
      name: s.name,
      url: s.url.length > 50 ? s.url.slice(0, 47) + '...' : s.url,
      skills: s.skillCount,
      lastSync: s.lastSync ? new Date(s.lastSync).toLocaleDateString() : chalk.dim('never'),
      status: s.lastError ? chalk.red('error') : chalk.green('ok'),
    })),
    [
      { header: 'Name', key: 'name' },
      { header: 'URL', key: 'url' },
      { header: 'Skills', key: 'skills', align: 'right' },
      { header: 'Last Sync', key: 'lastSync' },
      { header: 'Status', key: 'status' },
    ],
  );
  console.log(table);
}

export async function sourceSyncCommand(opts: { name?: string }): Promise<void> {
  const registry = await loadSourcesRegistry();
  const sources = opts.name ? registry.sources.filter((s) => s.name === opts.name) : registry.sources;

  if (sources.length === 0) {
    if (opts.name) {
      throw new SourceNotFoundError(opts.name);
    }
    console.log(chalk.dim('No sources configured.'));
    return;
  }

  for (const entry of sources) {
    try {
      const dir = await cloneOrPull(entry.url);
      const skills = await scanSourceRepo(dir, entry.name, entry.url);
      await updateSourceEntry(entry.name, {
        lastSync: new Date().toISOString(),
        skillCount: skills.length,
        lastError: undefined,
      });
      console.log(chalk.green(`  ✓ ${entry.name}: ${skills.length} skills`));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await updateSourceEntry(entry.name, { lastError: message });
      console.log(chalk.red(`  ✗ ${entry.name}: ${message}`));
    }
  }
}

async function confirmUpdate(slug: string): Promise<boolean> {
  if (!process.stdin.isTTY) return false;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(chalk.yellow(`  ? "${slug}" has changed. Update? [y/N] `), (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y' || answer.trim().toLowerCase() === 'yes');
    });
  });
}

export async function sourceRemoveCommand(name: string, opts: { purge?: boolean }): Promise<void> {
  const entry = await getSourceEntry(name);
  if (!entry) {
    throw new SourceNotFoundError(name);
  }

  await removeSourceEntry(name);

  if (opts.purge) {
    const dir = sourceRepoDir(name);
    if (await fs.pathExists(dir)) {
      await fs.remove(dir);
    }
    console.log(chalk.green(`✓ Removed source "${name}" and deleted cloned repo`));
  } else {
    console.log(chalk.green(`✓ Removed source "${name}"`));
  }
}
