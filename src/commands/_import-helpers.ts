import fs from 'fs-extra';
import path from 'path';
import { skillDir, skillFile, type ToolName } from '../fs/paths.js';
import { createMeta, writeMeta, type Source, type DeployAs } from '../core/meta.js';
import { deploy } from '../deploy/engine.js';
import { parseSkillContent, serializeSkillContent } from '../core/frontmatter.js';
import { recordVersion } from '../core/versioning.js';
import { hashContent } from '../core/hash.js';

export type ConflictStatus = 'new' | 'identical' | 'changed';

/**
 * Compare local skill content against remote content using SHA-256 hashes.
 * Returns 'new' if the skill doesn't exist locally, 'identical' if hashes match,
 * or 'changed' if content differs.
 */
export async function checkSkillConflict(slug: string, remoteContent: string): Promise<ConflictStatus> {
  const localPath = skillFile(slug);
  if (!(await fs.pathExists(localPath))) return 'new';

  // Normalize remote content the same way importSingleSkill does:
  // inject slug as name if frontmatter has no name field.
  let normalized = remoteContent;
  try {
    const parsed = parseSkillContent(remoteContent);
    if (!parsed.frontmatter.name) {
      parsed.frontmatter.name = slug;
      normalized = serializeSkillContent(parsed.frontmatter, parsed.content);
    }
  } catch {
    // If parsing fails, compare raw (same as import behavior)
  }

  const localContent = await fs.readFile(localPath, 'utf-8');
  return hashContent(localContent) === hashContent(normalized) ? 'identical' : 'changed';
}

export interface ImportSkillOpts {
  slug: string;
  content: string;
  source: Source;
  deployAs?: Partial<DeployAs>;
  tags?: string[];
}

/**
 * Import a single skill into the canonical store.
 * Creates the skill directory, writes SKILL.md and .sm-meta.json.
 */
export async function importSingleSkill(opts: ImportSkillOpts): Promise<void> {
  const dir = skillDir(opts.slug);
  await fs.ensureDir(dir);

  // Parse content and ensure frontmatter has name
  let raw = opts.content;
  let parsed;
  try {
    parsed = parseSkillContent(raw);
  } catch {
    parsed = null;
  }

  if (parsed && !parsed.frontmatter.name) {
    parsed.frontmatter.name = opts.slug;
    raw = serializeSkillContent(parsed.frontmatter, parsed.content);
  }

  // Write SKILL.md
  await fs.writeFile(skillFile(opts.slug), raw, 'utf-8');

  // Write metadata
  const meta = createMeta({
    source: opts.source,
    tags: opts.tags ?? parsed?.frontmatter.tags ?? [],
    deployAs: opts.deployAs ?? { cc: 'skill', codex: 'skill' },
  });
  await writeMeta(opts.slug, meta);

  // Record version
  try {
    await recordVersion(opts.slug, 'imported');
  } catch {
    // Non-critical
  }

  // If source has a dedicated skill directory with extra files, copy them.
  // Applies when the source file is SKILL.md inside a subdirectory (directory skill)
  // or at a repo root (single-skill repo). At repo root, repo infrastructure
  // (hidden entries, node_modules) is skipped but companion content is preserved.
  if (opts.source.originalPath && path.basename(opts.source.originalPath) === 'SKILL.md') {
    const srcDir = path.dirname(opts.source.originalPath);
    if (await fs.pathExists(srcDir)) {
      const stat = await fs.stat(srcDir);
      if (stat.isDirectory()) {
        const entries = await fs.readdir(srcDir);
        const isRepoRoot = entries.includes('.git');
        const sourceFile = path.basename(opts.source.originalPath!);
        for (const entry of entries) {
          if (entry === sourceFile || entry === 'SKILL.md' || entry === '.sm-meta.json' || entry === '.sm-history.json') continue;
          // At repo root, skip hidden entries (.git, .github, …) and node_modules
          // but still copy companion content like references/.
          if (isRepoRoot && (entry.startsWith('.') || entry === 'node_modules')) continue;
          const src = path.join(srcDir, entry);
          const dest = path.join(dir, entry);
          if (!(await fs.pathExists(dest))) {
            await fs.copy(src, dest);
          }
        }
      }
    }
  }
}

/**
 * Deploy a single skill to specified tools.
 * Returns the number of successful deployments.
 */
export async function deploySingleSkill(
  slug: string,
  tools: ToolName[],
): Promise<number> {
  let count = 0;
  for (const tool of tools) {
    try {
      const result = await deploy(slug, tool);
      if (result.action === 'deployed') count++;
    } catch {
      // Non-critical: continue with other tools
    }
  }
  return count;
}
