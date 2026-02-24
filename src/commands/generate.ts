import fs from 'fs-extra';
import path from 'path';
import {
  collectProjectFacts,
  inferProjectMeta,
  buildAllSections,
  renderSections,
  mergeContent,
  loadGenerateConfig,
  type GenerateTarget,
  type GenerateMode,
  type GenerateOptions,
  type SectionName,
  type SectionBuildOptions,
  type GenerateResult,
  type GenerateOutput,
  type SymlinkMode,
  SECTION_NAMES,
} from '../core/generate/index.js';
import { listSkills } from '../core/skill.js';
import { GenerateError } from '../utils/errors.js';
import { renderMarkdownToTerminal } from '../utils/markdown.js';

interface CliGenerateOpts {
  mode?: string;
  includeSkills?: boolean;
  withMcp?: boolean;
  strict?: boolean;
  section?: string;
  dryRun?: boolean;
  write?: boolean;
  symlink?: string;
}

const VALID_MODES: GenerateMode[] = ['inline', 'reference', 'summary'];
const VALID_SYMLINKS: SymlinkMode[] = ['claude-to-agents', 'agents-to-claude', 'none'];

function resolveOptions(
  target: GenerateTarget | 'both',
  opts: CliGenerateOpts,
): GenerateOptions {
  const mode = (opts.mode ?? 'inline') as string;
  if (!VALID_MODES.includes(mode as GenerateMode)) {
    throw new GenerateError(`Unknown mode: ${mode}. Valid: ${VALID_MODES.join(', ')}`);
  }

  if (opts.symlink && !VALID_SYMLINKS.includes(opts.symlink as SymlinkMode)) {
    throw new GenerateError(`Unknown symlink: ${opts.symlink}. Valid: ${VALID_SYMLINKS.join(', ')}`);
  }

  const section = opts.section as SectionName | undefined;
  if (section && !SECTION_NAMES.includes(section as SectionName)) {
    throw new GenerateError(`Unknown section: ${section}. Valid: ${SECTION_NAMES.join(', ')}`);
  }

  return {
    target,
    mode: mode as GenerateMode,
    includeSkills: opts.includeSkills ?? false,
    withMcp: opts.withMcp ?? false,
    strict: opts.strict ?? false,
    section: section as SectionName | undefined,
    dryRun: opts.dryRun ?? false,
    write: opts.dryRun ? false : (opts.write ?? false),
    symlink: opts.symlink as SymlinkMode | undefined,
    projectRoot: process.cwd(),
  };
}

export async function generateCommand(
  target: GenerateTarget | 'both',
  opts: CliGenerateOpts,
): Promise<void> {
  const options = resolveOptions(target, opts);
  const { results, effectiveSymlink } = await runGenerate(options);

  for (const result of results) {
    const relPath = path.relative(options.projectRoot, result.filePath);

    if (options.dryRun) {
      console.log(`\n--- ${relPath} (dry run) ---\n`);
      console.log(renderMarkdownToTerminal(result.mergeResult.content));
      printMergeSummary(result);
      continue;
    }

    if (!options.write) {
      console.log(`\n--- ${relPath} (preview) ---\n`);
      console.log(renderMarkdownToTerminal(result.mergeResult.content));
      printMergeSummary(result);
      continue;
    }

    // Write
    console.log(`${result.written ? 'Updated' : 'Created'} ${relPath}`);
    printMergeSummary(result);
  }

  if (!options.dryRun && !options.write) {
    console.log(`\nRun with --write to apply.`);
  }

  // Handle symlink for 'both' target (uses effective symlink which includes config)
  if (options.write && options.target === 'both' && effectiveSymlink !== 'none') {
    const claudeMd = path.join(options.projectRoot, 'CLAUDE.md');
    const agentsMd = path.join(options.projectRoot, 'AGENTS.md');

    if (effectiveSymlink === 'claude-to-agents') {
      await createRelativeSymlink(claudeMd, agentsMd, 'CLAUDE.md', 'AGENTS.md');
    } else if (effectiveSymlink === 'agents-to-claude') {
      await createRelativeSymlink(agentsMd, claudeMd, 'AGENTS.md', 'CLAUDE.md');
    }
  }
}

async function createRelativeSymlink(
  linkPath: string,
  targetPath: string,
  linkName: string,
  targetName: string,
): Promise<void> {
  // Check if the link already exists and is the right symlink
  try {
    const existingStat = await fs.lstat(linkPath);
    if (existingStat.isSymbolicLink()) {
      const existingTarget = await fs.readlink(linkPath);
      if (existingTarget === targetName) {
        console.log(`${linkName} already symlinked to ${targetName}`);
        return;
      }
    }
    // Remove existing file to replace with symlink
    if (existingStat.isFile() || existingStat.isSymbolicLink()) {
      console.log(`Replacing ${linkName} with symlink to ${targetName}`);
      await fs.remove(linkPath);
    }
  } catch {
    // Doesn't exist yet, fine
  }

  try {
    await fs.symlink(targetName, linkPath);
  } catch (err) {
    if (process.platform === 'win32' &&
      ((err as NodeJS.ErrnoException)?.code === 'EPERM' ||
       (err as NodeJS.ErrnoException)?.code === 'ENOTSUP')) {
      throw new GenerateError(
        `Permission denied creating symlink: ${linkName} → ${targetName}\n` +
        `On Windows, symlinks require Developer Mode or administrator privileges.\n` +
        `Enable Developer Mode: Settings → Update & Security → For Developers → Developer Mode\n` +
        `Alternatively, run without --symlink to generate both files independently.`
      );
    }
    throw err;
  }
  console.log(`Created symlink: ${linkName} → ${targetName}`);
}

function printMergeSummary(result: GenerateResult): void {
  const m = result.mergeResult;
  if (m.sectionsUpdated.length > 0) {
    console.log(`  Updated: ${m.sectionsUpdated.join(', ')}`);
  }
  if (m.sectionsAppended.length > 0) {
    console.log(`  Added: ${m.sectionsAppended.join(', ')}`);
  }
  if (m.sectionsPreserved.length > 0) {
    console.log(`  Preserved: ${m.sectionsPreserved.join(', ')}`);
  }
}

export async function runGenerate(options: GenerateOptions): Promise<GenerateOutput> {
  const { projectRoot } = options;

  // 1. Collect facts
  const facts = await collectProjectFacts(projectRoot);

  // 2. Strict mode validation
  if (options.strict) {
    if (!facts.packageJson) {
      throw new GenerateError('Strict mode: no package.json found in project root');
    }
  }

  // 3. Load config
  const config = await loadGenerateConfig(projectRoot);

  // 4. Infer metadata
  const meta = inferProjectMeta(facts, config);

  // 5. Load optional data
  const buildOpts: SectionBuildOptions = {
    includeSkills: options.includeSkills,
    withMcp: options.withMcp,
  };

  if (options.includeSkills) {
    const skills = await listSkills();
    buildOpts.skills = skills.map((s) => ({
      slug: s.slug,
      name: s.name,
      description: s.description,
      triggers: (s.content.frontmatter as Record<string, unknown>).triggers as
        | { files?: string[]; dirs?: string[] }
        | undefined,
    }));
  }

  // Determine effective symlink mode: explicit CLI flag wins, then config, then 'none'
  const symlink: SymlinkMode = options.symlink
    ?? (config?.symlink as SymlinkMode | undefined)
    ?? 'none';

  // 6. Determine targets
  const targets: GenerateTarget[] =
    options.target === 'both'
      ? ['claude-md', 'agents-md']
      : [options.target];

  const results: GenerateResult[] = [];

  for (const target of targets) {
    const fileName = target === 'claude-md' ? 'CLAUDE.md' : 'AGENTS.md';
    const filePath = path.join(projectRoot, fileName);
    const existing = target === 'claude-md' ? facts.existingClaudeMd : facts.existingAgentsMd;

    // Build sections
    const sections = buildAllSections(meta, target, options.mode, buildOpts, options.section);

    let mergeResult;
    if (existing) {
      mergeResult = mergeContent(existing, sections, options.section);
    } else {
      // First-time: wrap in managed blocks
      const content = renderSections(sections);
      mergeResult = {
        content,
        sectionsUpdated: [],
        sectionsPreserved: [],
        sectionsAppended: sections.map((s) => s.name),
        userContentPreserved: false,
      };
    }

    // Write if requested
    const written = existing !== null;
    if (options.write) {
      // If this will be symlinked away, skip writing to the link source
      // Only applies for 'both' target — single-target must always write
      const isSymlinkSource = options.target === 'both' && (
        symlink === 'claude-to-agents' && target === 'claude-md' ||
        symlink === 'agents-to-claude' && target === 'agents-md'
      );

      if (!isSymlinkSource) {
        // Remove stale symlink so we write a regular file, not through the link
        try {
          const stat = await fs.lstat(filePath);
          if (stat.isSymbolicLink()) {
            await fs.remove(filePath);
          }
        } catch { /* doesn't exist yet */ }
        await fs.writeFile(filePath, mergeResult.content, 'utf-8');
      }
    }

    results.push({ target, filePath, mergeResult, written });
  }

  return { results, effectiveSymlink: symlink };
}
