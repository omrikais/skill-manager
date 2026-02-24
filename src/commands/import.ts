import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import {
  SM_SKILLS_DIR,
  CC_COMMANDS_DIR,
  CODEX_PROMPTS_DIR,
  CODEX_SKILLS_DIR,
  CODEX_LEGACY_SKILLS_DIR,
  skillDir,
  skillFile,
} from '../fs/paths.js';
import { scanAll, type ScanSource } from '../fs/scanner.js';
import { deduplicateFiles, type DedupGroup } from '../core/dedup.js';
import { createMeta, writeMeta } from '../core/meta.js';
import { createBackup } from '../fs/backup.js';
import { deploy } from '../deploy/engine.js';
import { updateLastImport } from '../core/state.js';
import { log } from '../utils/logger.js';
import { parseSkillContent, serializeSkillContent } from '../core/frontmatter.js';
import { UsageError, SkillExistsError } from '../utils/errors.js';
import { recordVersion } from '../core/versioning.js';
import { slugify, skillExists } from '../core/skill.js';
import { importSingleSkill, deploySingleSkill } from './_import-helpers.js';

interface ImportOptions {
  from?: string;
  path?: string;
  dryRun?: boolean;
  slugs?: string[];
}

export async function importCommand(opts: ImportOptions): Promise<void> {
  // Single-skill import from a local path
  if (opts.path) {
    await importFromPath(opts.path, opts.dryRun);
    return;
  }

  const sources = resolveSources(opts.from);

  console.log(chalk.bold('\n📦 Skill Manager — Import\n'));

  // Step 1: Scan
  console.log(chalk.bold('Step 1: Scanning source directories...'));
  const scanResult = await scanAll(sources);

  for (const scan of scanResult.scans) {
    const icon = scan.files.length > 0 ? '✓' : '–';
    console.log(`  ${icon} ${scan.source}: ${scan.files.length} files found`);
    for (const err of scan.errors) {
      console.log(chalk.yellow(`    ⚠ ${err.path}: ${err.error}`));
    }
  }

  if (scanResult.allFiles.length === 0) {
    console.log(chalk.yellow('\nNo skills found to import.'));
    return;
  }

  console.log(`\n  Total: ${scanResult.allFiles.length} files scanned`);

  // Step 2: Deduplicate
  console.log(chalk.bold('\nStep 2: Deduplicating...'));
  let groups = deduplicateFiles(scanResult.allFiles);

  const dupeCount = scanResult.allFiles.length - groups.length;
  console.log(`  ${groups.length} unique skills identified`);
  if (dupeCount > 0) {
    console.log(`  ${dupeCount} duplicates detected`);
  }

  if (opts.slugs) {
    const slugSet = new Set(opts.slugs);
    groups = groups.filter((g) => slugSet.has(g.slug));
    if (groups.length === 0) {
      console.log(chalk.yellow('\nNo skills selected for import.'));
      return;
    }
  }

  // Show plan
  console.log(chalk.bold('\nImport plan:'));
  for (const group of groups) {
    const sources = group.files.map((f) => f.source).join(', ');
    const isDupe = group.files.length > 1 ? chalk.cyan(' [deduped]') : '';
    console.log(`  ${chalk.green('+')} ${group.slug} (from: ${sources})${isDupe}`);
  }

  if (opts.dryRun) {
    console.log(chalk.yellow('\n--dry-run: No changes made.'));
    return;
  }

  // Step 3: Backup
  console.log(chalk.bold('\nStep 3: Backing up originals...'));
  const backupInfo = await createBackup([
    { label: 'cc-commands', path: CC_COMMANDS_DIR },
    { label: 'codex-prompts', path: CODEX_PROMPTS_DIR },
    { label: 'codex-skills', path: CODEX_SKILLS_DIR },
    { label: 'agents-skills', path: CODEX_LEGACY_SKILLS_DIR },
  ]);
  console.log(`  Backup created: ${backupInfo.id} (${backupInfo.fileCount} files)`);

  // Step 4: Import into canonical store
  console.log(chalk.bold('\nStep 4: Importing into canonical store...'));
  await fs.ensureDir(SM_SKILLS_DIR);

  let imported = 0;
  for (const group of groups) {
    try {
      await importGroup(group);
      try {
        await recordVersion(group.slug, 'imported');
      } catch {
        /* non-critical */
      }
      imported++;
      console.log(`  ${chalk.green('✓')} ${group.slug}`);
    } catch (err) {
      console.log(`  ${chalk.red('✗')} ${group.slug}: ${err}`);
    }
  }

  // Step 5: Rewire — replace originals with symlinks
  console.log(chalk.bold('\nStep 5: Creating symlinks...'));
  let linked = 0;
  for (const group of groups) {
    try {
      const results = await deployGroup(group);
      linked += results;
    } catch (err) {
      log.warn(`Failed to deploy ${group.slug}: ${err}`);
    }
  }
  console.log(`  ${linked} symlinks created`);

  // Step 6: Update state
  await updateLastImport();

  console.log(chalk.bold.green(`\n✓ Import complete: ${imported} skills imported, ${linked} symlinks created.\n`));
}

async function importGroup(group: DedupGroup): Promise<void> {
  const dir = skillDir(group.slug);
  await fs.ensureDir(dir);

  // Parse content and ensure frontmatter has name
  let raw = group.canonical.content;
  let parsed;
  try {
    parsed = parseSkillContent(raw);
  } catch {
    parsed = null;
  }

  if (parsed && !parsed.frontmatter.name) {
    parsed.frontmatter.name = group.slug;
    raw = serializeSkillContent(parsed.frontmatter, parsed.content);
  }

  // Write SKILL.md
  await fs.writeFile(skillFile(group.slug), raw, 'utf-8');

  // Determine deploy formats based on where the file came from
  const ccSource = group.files.find((f) => f.source === 'cc-commands');
  const codexPromptSource = group.files.find((f) => f.source === 'codex-prompts');
  const codexSkillSource = group.files.find((f) => f.source === 'codex-skills' || f.source === 'agents-skills');

  const deployAs: { cc: string; codex: string } = { cc: 'none', codex: 'none' };

  if (ccSource) deployAs.cc = 'legacy-command';
  if (codexSkillSource) deployAs.codex = 'skill';
  else if (codexPromptSource) deployAs.codex = 'legacy-prompt';

  // Determine original format
  const originalFormat = ccSource ? 'legacy-command' : codexPromptSource ? 'legacy-prompt' : 'skill';

  // Write metadata
  const meta = createMeta({
    source: {
      type: 'imported',
      importedFrom: group.canonical.source,
      originalPath: group.canonical.path,
    },
    tags: parsed?.frontmatter.tags ?? [],
    deployAs: deployAs as { cc: 'legacy-command' | 'skill' | 'none'; codex: 'legacy-prompt' | 'skill' | 'none' },
    originalFormat,
  });
  await writeMeta(group.slug, meta);

  // If canonical was a skill dir, copy references too
  if (
    (group.canonical.source === 'codex-skills' || group.canonical.source === 'agents-skills') &&
    (await fs.pathExists(group.canonical.path))
  ) {
    const stat = await fs.stat(group.canonical.path);
    if (stat.isDirectory()) {
      // Copy extra files (not the main .md)
      const entries = await fs.readdir(group.canonical.path);
      for (const entry of entries) {
        if (entry === 'SKILL.md' || entry === '.sm-meta.json') continue;
        const src = path.join(group.canonical.path, entry);
        const dest = path.join(dir, entry);
        if (!(await fs.pathExists(dest))) {
          await fs.copy(src, dest);
        }
      }
    }
  }
}

async function deployGroup(group: DedupGroup): Promise<number> {
  let count = 0;

  // Determine which tools to deploy to
  const deployCc = group.files.some((f) => f.source === 'cc-commands');
  const deployCodexPrompt = group.files.some((f) => f.source === 'codex-prompts');
  const deployCodexSkill = group.files.some((f) => f.source === 'codex-skills' || f.source === 'agents-skills');

  if (deployCc) {
    const result = await deploy(group.slug, 'cc', 'legacy-command');
    if (result.action === 'deployed') count++;
  }

  if (deployCodexSkill) {
    const result = await deploy(group.slug, 'codex', 'skill');
    if (result.action === 'deployed') count++;
  } else if (deployCodexPrompt) {
    const result = await deploy(group.slug, 'codex', 'legacy-prompt');
    if (result.action === 'deployed') count++;
  }

  return count;
}

async function importFromPath(dirPath: string, dryRun?: boolean): Promise<void> {
  const resolved = path.resolve(dirPath);
  const skillMdPath = path.join(resolved, 'SKILL.md');

  if (!(await fs.pathExists(skillMdPath))) {
    throw new UsageError(
      `No SKILL.md found in "${resolved}". The path must be a skill directory containing a SKILL.md file.`,
    );
  }

  const content = await fs.readFile(skillMdPath, 'utf-8');

  // Derive slug from frontmatter name (if present) or directory basename
  let slug: string;
  try {
    const parsed = parseSkillContent(content);
    slug = parsed.frontmatter.name ? slugify(parsed.frontmatter.name) : slugify(path.basename(resolved));
  } catch {
    slug = slugify(path.basename(resolved));
  }

  if (!slug) {
    throw new UsageError(`Could not derive a valid slug from "${resolved}".`);
  }

  if (await skillExists(slug)) {
    throw new SkillExistsError(slug);
  }

  if (dryRun) {
    console.log(chalk.bold(`\nDry run: would import "${slug}" from ${resolved}`));
    console.log(chalk.yellow('--dry-run: No changes made.'));
    return;
  }

  await importSingleSkill({
    slug,
    content,
    source: { type: 'created', originalPath: skillMdPath },
    deployAs: { cc: 'skill', codex: 'skill' },
  });

  const deployed = await deploySingleSkill(slug, ['cc', 'codex']);

  console.log(chalk.green(`\n✓ Imported skill: ${slug}`));
  console.log(chalk.dim(`  ${skillFile(slug)}`));
  if (deployed > 0) {
    console.log(chalk.dim(`  ${deployed} symlink${deployed !== 1 ? 's' : ''} created`));
  }
  console.log(chalk.dim(`  Run \`sm edit ${slug}\` to edit, or \`sm info ${slug}\` to view details.`));
}

function resolveSources(from?: string): ScanSource[] | undefined {
  if (!from || from === 'all') return undefined;
  switch (from) {
    case 'cc':
      return ['cc-commands'];
    case 'codex':
      return ['codex-prompts', 'codex-skills', 'agents-skills'];
    default:
      throw new UsageError(`Unknown source: "${from}". Valid sources: all, cc, codex`);
  }
}
