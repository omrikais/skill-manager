import fs from 'fs-extra';
import chalk from 'chalk';
import { listPacks, loadPack, type PackSkillRef } from '../core/packs.js';
import {
  getSourceEntry,
  addSourceEntry,
  updateSourceEntry,
  deriveSourceName,
} from '../core/sources.js';
import { sourceRepoDir } from '../fs/paths.js';
import { cloneOrPull, cloneOrPullWithStatus, normalizeRemoteUrl } from '../sources/git.js';
import { scanSourceRepo } from '../sources/scanner.js';
import { importSingleSkill, deploySingleSkill } from './_import-helpers.js';
import { readMeta } from '../core/meta.js';
import { formatTable } from '../utils/table.js';
import type { RemoteSkill } from '../sources/scanner.js';

export async function packListCommand(opts: { json?: boolean }): Promise<void> {
  const packs = await listPacks();

  if (opts.json) {
    process.stdout.write(JSON.stringify(packs, null, 2) + '\n');
    return;
  }

  if (packs.length === 0) {
    console.log(chalk.dim('No packs available.'));
    return;
  }

  const table = formatTable(
    packs.map((p) => ({
      name: p.displayName,
      description: p.description,
      skills: p.skills.length,
      repos: p.repos.length,
      version: p.version,
    })),
    [
      { header: 'Name', key: 'name' },
      { header: 'Description', key: 'description', width: 50 },
      { header: 'Skills', key: 'skills', align: 'right' },
      { header: 'Repos', key: 'repos', align: 'right' },
      { header: 'Version', key: 'version' },
    ],
  );
  console.log(table);
}

export async function packInstallCommand(name: string, opts: { dryRun?: boolean }): Promise<void> {
  const pack = await loadPack(name);

  console.log(chalk.bold(`\nInstalling pack "${pack.displayName}" (${pack.skills.length} skills from ${pack.repos.length} repos)\n`));

  // Step 1: Ensure all repos are cloned/synced and scan for skills
  const allRemoteSkills: RemoteSkill[] = [];
  const pendingRepos: string[] = [];

  for (const repo of pack.repos) {
    const repoName = deriveSourceName(repo);
    const existing = await getSourceEntry(repoName);

    if (opts.dryRun) {
      // In dry-run mode, scan already-cloned repos without pulling;
      // skip new repos entirely to avoid side effects.
      const dir = sourceRepoDir(repoName);
      if (existing && (await fs.pathExists(dir))) {
        const skills = await scanSourceRepo(dir, repoName, repo);
        allRemoteSkills.push(...skills);
      } else {
        pendingRepos.push(repo);
      }
      continue;
    }

    // If a source with the same name exists but points to a different repo, skip
    if (existing && normalizeRemoteUrl(existing.url) !== normalizeRemoteUrl(repo)) {
      console.log(chalk.yellow(
        `  ⚠ Source "${repoName}" already exists with a different URL (${existing.url}). ` +
        `Skipping pack repo ${repo}. Remove the existing source first to resolve.`,
      ));
      continue;
    }

    let dir: string;
    try {
      if (!existing) {
        const result = await cloneOrPullWithStatus(repo);
        dir = result.dir;
      } else {
        dir = await cloneOrPull(repo);
      }

      const skills = await scanSourceRepo(dir, repoName, repo);
      allRemoteSkills.push(...skills);

      if (!existing) {
        await addSourceEntry({
          name: repoName,
          url: repo,
          addedAt: new Date().toISOString(),
          lastSync: new Date().toISOString(),
          skillCount: skills.length,
        });
      } else {
        await updateSourceEntry(repoName, {
          lastSync: new Date().toISOString(),
          skillCount: skills.length,
        });
      }
    } catch (err) {
      console.log(chalk.yellow(`  ⚠ Failed to clone ${repo}: ${err instanceof Error ? err.message : err}`));
    }
  }

  if (opts.dryRun && pendingRepos.length > 0) {
    console.log(chalk.dim(`  Repos not yet cloned (would be cloned on install): ${pendingRepos.map(deriveSourceName).join(', ')}`));
  }

  // Step 2: Match pack skills against scanned skills
  const { matched, missing } = matchPackSkills(pack.skills, allRemoteSkills);

  // In dry-run mode, skills from pending (uncloned) repos aren't truly missing
  const pendingRepoSet = new Set(pendingRepos);
  const trulyMissing = missing.filter((slug) => {
    const ref = pack.skills.find((s) => s.slug === slug);
    return !ref || !pendingRepoSet.has(ref.repo);
  });
  const pendingSkills = missing.length - trulyMissing.length;

  if (trulyMissing.length > 0) {
    console.log(chalk.yellow(`  ⚠ Skills not found in repos: ${trulyMissing.join(', ')}`));
  }
  if (pendingSkills > 0) {
    console.log(chalk.dim(`  ${pendingSkills} skill(s) in repos not yet cloned (will be resolved on install)`));
  }

  // Classify matched skills: not installed, installed from same source, or conflicting source
  const toInstall: RemoteSkill[] = [];
  const alreadyInstalled: RemoteSkill[] = [];
  const conflicts: { skill: RemoteSkill; installedRepo: string }[] = [];

  for (const skill of matched) {
    if (!skill.installed) {
      toInstall.push(skill);
      continue;
    }
    // Skill slug exists locally — check if it came from the expected repo
    try {
      const meta = await readMeta(skill.slug);
      if (!meta.source.repo) {
        // Local skill (created/imported) — not from any repo, so not the pack's version
        conflicts.push({ skill, installedRepo: `local (${meta.source.type})` });
        continue;
      }
      if (normalizeRemoteUrl(meta.source.repo) !== normalizeRemoteUrl(skill.sourceUrl)) {
        conflicts.push({ skill, installedRepo: meta.source.repo });
        continue;
      }
    } catch {
      // Can't read meta — treat as installed (safe default)
    }
    alreadyInstalled.push(skill);
  }

  if (alreadyInstalled.length > 0) {
    console.log(chalk.dim(`  Already installed: ${alreadyInstalled.map((s) => s.slug).join(', ')}`));
  }

  if (conflicts.length > 0) {
    for (const { skill, installedRepo } of conflicts) {
      console.log(chalk.yellow(`  ⚠ ${skill.slug}: installed from ${installedRepo}, pack expects ${skill.sourceUrl}`));
    }
  }

  if (toInstall.length === 0) {
    if (trulyMissing.length > 0 || conflicts.length > 0) {
      const issues: string[] = [];
      if (trulyMissing.length > 0) issues.push(`${trulyMissing.length} not found`);
      if (conflicts.length > 0) issues.push(`${conflicts.length} from different source`);
      console.log(chalk.yellow(`\n⚠ Pack "${pack.displayName}" has issues: ${issues.join(', ')}.`));
    } else {
      console.log(chalk.green(`\n✓ All skills from pack "${pack.displayName}" are already installed.`));
    }
    return;
  }

  if (opts.dryRun) {
    console.log(chalk.bold('\nWould install:'));
    for (const skill of toInstall) {
      console.log(`  ${chalk.green('+')} ${skill.slug} (${skill.name})`);
    }
    console.log(chalk.yellow('\n--dry-run: No changes made.'));
    return;
  }

  // Step 3: Install matched skills
  let installed = 0;
  for (const skill of toInstall) {
    try {
      const content = await fs.readFile(skill.filePath, 'utf-8');
      await importSingleSkill({
        slug: skill.slug,
        content,
        source: { type: 'git', repo: skill.sourceUrl, originalPath: skill.filePath },
      });
      await deploySingleSkill(skill.slug, ['cc', 'codex']);
      installed++;
      console.log(chalk.green(`  ✓ ${skill.slug}`));
    } catch (err) {
      console.log(chalk.yellow(`  ⚠ ${skill.slug}: ${err instanceof Error ? err.message : err}`));
    }
  }

  console.log(chalk.green(`\n✓ Installed ${installed} skills from pack "${pack.displayName}"`));
}

/**
 * Match pack skill refs against scanned remote skills using both slug and repo URL.
 */
export function matchPackSkills(
  refs: PackSkillRef[],
  remoteSkills: RemoteSkill[],
): { matched: RemoteSkill[]; missing: string[] } {
  const matched: RemoteSkill[] = [];
  const missing: string[] = [];

  for (const ref of refs) {
    const found = remoteSkills.find((s) => s.slug === ref.slug && s.sourceUrl === ref.repo);
    if (found) {
      matched.push(found);
    } else {
      missing.push(ref.slug);
    }
  }

  return { matched, missing };
}
