import fs from 'fs-extra';
import path from 'path';
import {
  SM_SKILLS_DIR,
  CC_COMMANDS_DIR,
  CC_SKILLS_DIR,
  CODEX_PROMPTS_DIR,
  CODEX_SKILLS_DIR,
  CODEX_LEGACY_SKILLS_DIR,
  projectCCSkillsDir,
  projectCodexSkillsDir,
  skillDir,
  type ToolName,
  type DeployFormat,
} from '../fs/paths.js';
import { isSymlink, safeReadlink } from '../fs/links.js';
import { skillExists } from './skill.js';
import { slugify } from '../utils/slug.js';
import { loadConfig } from './config.js';
import {
  getLastAdoptScan,
  updateLastAdoptScan,
  resetStateCache,
} from './state.js';
import { importSingleSkill } from '../commands/_import-helpers.js';
import { deploy, deployToProject } from '../deploy/engine.js';
import { log } from '../utils/logger.js';

const DEBOUNCE_MS = 10_000;

export interface AdoptResult {
  adopted: Array<{ originalSlug: string; finalSlug: string; path: string }>;
  skipped: Array<{ path: string; reason: string }>;
  errors: Array<{ path: string; error: string }>;
}

interface UnmanagedEntry {
  slug: string;
  contentPath: string;  // path to .md file (for reading content)
  originalPath: string; // path to remove after adoption (file or directory)
  dirLabel: string;     // which directory it was found in
  tool: ToolName;
  format: DeployFormat;
  isDirectory: boolean;
  scope: 'user' | 'project';
  projectRoot?: string;
}

/** Scan target definition */
interface ScanTarget {
  dir: string;
  tool: ToolName;
  format: DeployFormat;
  isFlat: boolean; // flat = .md files; !flat = skill directories
  scope: 'user' | 'project';
  projectRoot?: string;
}

function getUserScanTargets(): ScanTarget[] {
  return [
    { dir: CC_COMMANDS_DIR, tool: 'cc', format: 'legacy-command', isFlat: true, scope: 'user' },
    { dir: CC_SKILLS_DIR, tool: 'cc', format: 'skill', isFlat: false, scope: 'user' },
    { dir: CODEX_PROMPTS_DIR, tool: 'codex', format: 'legacy-prompt', isFlat: true, scope: 'user' },
    { dir: CODEX_SKILLS_DIR, tool: 'codex', format: 'skill', isFlat: false, scope: 'user' },
    { dir: CODEX_LEGACY_SKILLS_DIR, tool: 'codex', format: 'skill', isFlat: false, scope: 'user' },
  ];
}

function getProjectScanTargets(projectRoot: string): ScanTarget[] {
  return [
    { dir: projectCCSkillsDir(projectRoot), tool: 'cc', format: 'skill', isFlat: false, scope: 'project', projectRoot },
    { dir: projectCodexSkillsDir(projectRoot), tool: 'codex', format: 'skill', isFlat: false, scope: 'project', projectRoot },
  ];
}

/**
 * Find the primary .md file in a skill directory.
 * Prefers SKILL.md, falls back to first .md file found.
 */
async function findSkillFileInDir(dirPath: string): Promise<string | null> {
  const skillMd = path.join(dirPath, 'SKILL.md');
  if (await fs.pathExists(skillMd)) return skillMd;

  try {
    const entries = await fs.readdir(dirPath);
    for (const e of entries) {
      if (e.endsWith('.md') && !e.startsWith('.')) {
        return path.join(dirPath, e);
      }
    }
  } catch {
    // Directory unreadable
  }
  return null;
}

/**
 * Detect unmanaged skill files/directories across all tool directories.
 */
export async function detectUnmanaged(opts?: {
  projectRoot?: string;
}): Promise<UnmanagedEntry[]> {
  const targets = getUserScanTargets();

  if (opts?.projectRoot) {
    const ccDir = projectCCSkillsDir(opts.projectRoot);
    const codexDir = projectCodexSkillsDir(opts.projectRoot);
    const ccExists = await fs.pathExists(path.dirname(ccDir)); // .claude/
    const codexExists = await fs.pathExists(path.dirname(codexDir)); // .agents/
    // Deduplicate: skip project targets that resolve to the same path as a user target
    // (e.g. when projectRoot is HOME)
    const userDirs = new Set(targets.map(t => t.dir));
    if (ccExists) {
      for (const t of getProjectScanTargets(opts.projectRoot).filter(t => t.tool === 'cc')) {
        if (!userDirs.has(t.dir)) targets.push(t);
      }
    }
    if (codexExists) {
      for (const t of getProjectScanTargets(opts.projectRoot).filter(t => t.tool === 'codex')) {
        if (!userDirs.has(t.dir)) targets.push(t);
      }
    }
  }

  const unmanaged: UnmanagedEntry[] = [];

  for (const target of targets) {
    if (!(await fs.pathExists(target.dir))) continue;

    let entries: fs.Dirent[];
    try {
      entries = await fs.readdir(target.dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;

      const fullPath = path.join(target.dir, entry.name);

      // Check if it's a symlink
      if (await isSymlink(fullPath)) {
        const linkTarget = await safeReadlink(fullPath);
        if (linkTarget && linkTarget.startsWith(SM_SKILLS_DIR)) {
          // SM-managed symlink — skip
          continue;
        }
        // External symlink — leave alone
        continue;
      }

      if (target.isFlat) {
        // Flat directories: look for real .md files
        if (!entry.name.endsWith('.md')) continue;
        if (!entry.isFile()) continue;

        const slug = entry.name.replace(/\.md$/, '');
        unmanaged.push({
          slug,
          contentPath: fullPath,
          originalPath: fullPath,
          dirLabel: target.dir,
          tool: target.tool,
          format: target.format,
          isDirectory: false,
          scope: target.scope,
          projectRoot: target.projectRoot,
        });
      } else {
        // Skill directories: look for real directories containing .md
        if (!entry.isDirectory()) continue;

        const skillFilePath = await findSkillFileInDir(fullPath);
        if (!skillFilePath) {
          // No .md found — skip
          continue;
        }

        unmanaged.push({
          slug: entry.name,
          contentPath: skillFilePath,
          originalPath: fullPath,
          dirLabel: target.dir,
          tool: target.tool,
          format: target.format,
          isDirectory: true,
          scope: target.scope,
          projectRoot: target.projectRoot,
        });
      }
    }
  }

  return unmanaged;
}

/**
 * Resolve a unique slug, appending numeric suffixes if needed.
 */
export async function resolveUniqueSlug(baseSlug: string): Promise<string> {
  const slug = slugify(baseSlug);
  if (!slug) return 'unnamed-skill';

  if (!(await skillExists(slug))) return slug;

  for (let i = 2; i <= 100; i++) {
    const candidate = `${slug}-${i}`;
    if (!(await skillExists(candidate))) return candidate;
  }

  // Extremely unlikely — fall back to timestamped slug
  return `${slug}-${Date.now()}`;
}

/**
 * Build the deployAs map: only deploy to the tool where the skill was found.
 */
function buildDeployAs(tool: ToolName, format: DeployFormat) {
  return {
    cc: (tool === 'cc' ? format : 'none') as 'skill' | 'legacy-command' | 'none',
    codex: (tool === 'codex' ? format : 'none') as 'skill' | 'legacy-prompt' | 'none',
  };
}

export interface AutoAdoptOpts {
  projectRoot?: string;
  silent?: boolean;
  skipDebounce?: boolean;
}

/**
 * Full auto-adopt workflow: detect unmanaged skills, import them, replace originals with symlinks.
 */
export async function autoAdopt(opts?: AutoAdoptOpts): Promise<AdoptResult> {
  const result: AdoptResult = { adopted: [], skipped: [], errors: [] };

  try {
    const config = await loadConfig();
    if (config.autoAdopt === false) return result;
  } catch {
    // Config load failed — proceed with default (adopt enabled)
  }

  // Debounce check (skipped for TUI mount which always needs a fresh scan)
  if (!opts?.skipDebounce) {
    try {
      resetStateCache();
      const last = await getLastAdoptScan();
      if (last) {
        const elapsed = Date.now() - new Date(last).getTime();
        if (elapsed < DEBOUNCE_MS) {
          log.debug('Auto-adopt: debounce — skipping scan');
          return result;
        }
      }
    } catch {
      // State read failed — proceed anyway
    }
  } else {
    resetStateCache();
  }

  // Update timestamp immediately to prevent concurrent scans
  try {
    await updateLastAdoptScan();
  } catch {
    // Non-critical
  }

  let entries: UnmanagedEntry[];
  try {
    entries = await detectUnmanaged({ projectRoot: opts?.projectRoot });
  } catch {
    return result;
  }

  if (entries.length === 0) return result;

  for (const entry of entries) {
    let finalSlug: string | undefined;
    try {
      // Read content
      let content: string;
      try {
        content = await fs.readFile(entry.contentPath, 'utf-8');
      } catch {
        result.skipped.push({ path: entry.originalPath, reason: 'Unreadable file' });
        continue;
      }

      if (!content.trim()) {
        result.skipped.push({ path: entry.originalPath, reason: 'Empty file' });
        continue;
      }

      // Resolve unique slug
      finalSlug = await resolveUniqueSlug(entry.slug);
      const deployAs = buildDeployAs(entry.tool, entry.format);

      // Import into canonical store
      await importSingleSkill({
        slug: finalSlug,
        content,
        source: {
          type: 'adopted',
          importedFrom: entry.dirLabel,
          originalPath: entry.originalPath,
        },
        deployAs,
        tags: [],
      });

      // For directory skills: copy extra files (references, etc.)
      // Not wrapped in try/catch — if copy fails, the outer catch keeps the original intact
      if (entry.isDirectory) {
        const canonDir = skillDir(finalSlug);
        const dirEntries = await fs.readdir(entry.originalPath);
        for (const de of dirEntries) {
          // Skip the .md we already imported, and sm metadata
          if (de === path.basename(entry.contentPath)) continue;
          if (de === 'SKILL.md') continue;
          if (de === '.sm-meta.json' || de === '.sm-history.json') continue;

          const src = path.join(entry.originalPath, de);
          const dest = path.join(canonDir, de);
          if (!(await fs.pathExists(dest))) {
            await fs.copy(src, dest);
          }
        }
      }

      // Remove original file/directory
      await fs.remove(entry.originalPath);

      // Deploy back to where it was found (creates the symlink)
      try {
        if (entry.scope === 'project' && entry.projectRoot) {
          await deployToProject(finalSlug, entry.tool, entry.projectRoot);
        } else {
          await deploy(finalSlug, entry.tool);
        }
      } catch (deployErr) {
        // Import succeeded but deploy failed — skill is in canonical store but no symlink
        log.warn(`Adopted ${finalSlug} but deploy failed: ${deployErr instanceof Error ? deployErr.message : String(deployErr)}. Run "sm add ${finalSlug}" to fix.`);
        result.errors.push({
          path: entry.originalPath,
          error: `Imported but deploy failed: ${deployErr instanceof Error ? deployErr.message : String(deployErr)}`,
        });
        continue;
      }

      result.adopted.push({
        originalSlug: entry.slug,
        finalSlug,
        path: entry.originalPath,
      });
    } catch (err) {
      // Roll back partial import to prevent orphaned duplicates on next run
      if (finalSlug) {
        try { await fs.remove(skillDir(finalSlug)); } catch { /* best-effort cleanup */ }
      }
      result.errors.push({
        path: entry.originalPath,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (result.adopted.length > 0 && !opts?.silent) {
    const names = result.adopted.map((a) => a.finalSlug).join(', ');
    log.info(`Auto-adopted ${result.adopted.length} skill(s): ${names}`);
  }

  return result;
}
