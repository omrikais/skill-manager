import fs from 'fs-extra';
import path from 'path';
import {
  CC_COMMANDS_DIR,
  CODEX_PROMPTS_DIR,
  CODEX_SKILLS_DIR,
  CODEX_LEGACY_SKILLS_DIR,
} from './paths.js';
import { buildScannedFile, type ScannedFile } from '../core/dedup.js';
import { isSymlink, safeReadlink } from './links.js';

export type ScanSource = 'cc-commands' | 'codex-prompts' | 'codex-skills' | 'agents-skills';

export interface ScanResult {
  source: ScanSource;
  files: ScannedFile[];
  errors: Array<{ path: string; error: string }>;
}

export interface FullScanResult {
  scans: ScanResult[];
  allFiles: ScannedFile[];
  totalErrors: number;
}

/**
 * Scan all known skill/command directories.
 */
export async function scanAll(sources?: ScanSource[]): Promise<FullScanResult> {
  const toScan = sources ?? ['cc-commands', 'codex-prompts', 'codex-skills', 'agents-skills'];
  const scans: ScanResult[] = [];

  for (const source of toScan) {
    scans.push(await scanSource(source));
  }

  return {
    scans,
    allFiles: scans.flatMap((s) => s.files),
    totalErrors: scans.reduce((sum, s) => sum + s.errors.length, 0),
  };
}

async function scanSource(source: ScanSource): Promise<ScanResult> {
  const dir = sourceDir(source);
  const result: ScanResult = { source, files: [], errors: [] };

  if (!(await fs.pathExists(dir))) return result;

  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;

    const fullPath = path.join(dir, entry.name);

    try {
      if (source === 'cc-commands' || source === 'codex-prompts') {
        // Flat markdown files
        if (entry.name.endsWith('.md')) {
          const content = await fs.readFile(fullPath, 'utf-8');
          const slug = entry.name.replace(/\.md$/, '');
          result.files.push(buildScannedFile(fullPath, source, slug, content));
        }
      } else {
        // Skill directories
        if (entry.isDirectory() || entry.isSymbolicLink()) {
          const resolvedPath = await resolveSkillDir(fullPath);
          if (!resolvedPath) continue;

          const skillMd = await findSkillFile(resolvedPath);
          if (skillMd) {
            const content = await fs.readFile(skillMd, 'utf-8');
            result.files.push(buildScannedFile(fullPath, source, entry.name, content));
          }
        }
      }
    } catch (err) {
      result.errors.push({
        path: fullPath,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}

function sourceDir(source: ScanSource): string {
  switch (source) {
    case 'cc-commands':
      return CC_COMMANDS_DIR;
    case 'codex-prompts':
      return CODEX_PROMPTS_DIR;
    case 'codex-skills':
      return CODEX_SKILLS_DIR;
    case 'agents-skills':
      return CODEX_LEGACY_SKILLS_DIR;
  }
}

/**
 * Resolve a skill directory, following symlinks if needed.
 */
async function resolveSkillDir(dirPath: string): Promise<string | null> {
  if (await isSymlink(dirPath)) {
    const target = await safeReadlink(dirPath);
    if (!target) return null;
    const resolved = path.isAbsolute(target)
      ? target
      : path.resolve(path.dirname(dirPath), target);
    if (await fs.pathExists(resolved)) return resolved;
    return null;
  }
  return dirPath;
}

/**
 * Find the main skill file in a directory.
 * Looks for SKILL.md, then any .md file.
 */
async function findSkillFile(dirPath: string): Promise<string | null> {
  const skillMd = path.join(dirPath, 'SKILL.md');
  if (await fs.pathExists(skillMd)) return skillMd;

  // Look for any .md file
  const entries = await fs.readdir(dirPath);
  for (const e of entries) {
    if (e.endsWith('.md') && !e.startsWith('.')) {
      return path.join(dirPath, e);
    }
  }

  return null;
}
