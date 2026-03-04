import fs from 'fs-extra';
import path from 'path';
import { skillDir } from '../fs/paths.js';
import { parseSkillContent } from '../core/frontmatter.js';
import { slugify } from '../utils/slug.js';

export interface RemoteSkill {
  slug: string;
  name: string;
  description: string;
  tags: string[];
  sourceName: string;
  sourceUrl: string;
  filePath: string;
  dirPath: string;
  installed: boolean;
}

const IGNORE_DIRS = new Set(['.git', 'node_modules', 'references']);

/** Hidden directories that may contain skills and should be recursed into. */
const ALLOWED_HIDDEN_DIRS = new Set(['.claude', '.codex', '.agents']);
const IGNORE_FILES = new Set([
  'README.md',
  'LICENSE',
  'LICENSE.md',
  'CHANGELOG.md',
  'CLAUDE.md',
  'CONTRIBUTING.md',
  'CODE_OF_CONDUCT.md',
  'SECURITY.md',
  'CHANGES.md',
  'HISTORY.md',
  'AUTHORS.md',
]);

const MAX_DEPTH = 5;

/** Directory names too generic to use as skill slugs — derive from frontmatter instead. */
const GENERIC_DIR_NAMES = new Set(['skill', 'skills']);

/**
 * Scan a cloned repository directory for skill files (recursive).
 *
 * Rules:
 * 1. A directory with SKILL.md is a skill (recursive, any depth) — don't recurse further.
 *    For generic dir names ("skill", "skills"), derive slug from frontmatter name.
 * 2. A directory without SKILL.md is organizational — always recurse (up to MAX_DEPTH).
 * 3. Top-level standalone .md files are treated as skills (backward compat for flat repos).
 * 4. Deduplicate by slug (first found wins).
 */
export async function scanSourceRepo(repoDir: string, sourceName: string, sourceUrl: string): Promise<RemoteSkill[]> {
  const skills: RemoteSkill[] = [];
  const seen = new Set<string>();

  if (!(await fs.pathExists(repoDir))) return skills;

  // Phase 1: Recursive scan for skill directories
  await scanDir(repoDir, 0, seen, skills, sourceName, sourceUrl);

  // Phase 2: Top-level standalone .md files (backward compat).
  // Require frontmatter with a name field to avoid false positives
  // (e.g., AGENTS.md, TODO.md, SETUP.md).
  const entries = await fs.readdir(repoDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith('.md')) continue;
    if (IGNORE_FILES.has(entry.name)) continue;

    const fullPath = path.join(repoDir, entry.name);
    if (!hasSkillFrontmatter(fullPath)) continue;

    // For SKILL.md at repo root, derive slug from frontmatter name
    // (slug "SKILL" is useless). For other .md files, use filename.
    let slug: string;
    if (entry.name === 'SKILL.md') {
      const derived = slugFromFrontmatter(fullPath);
      if (!derived) continue; // Can't derive a useful slug
      slug = derived;
    } else {
      slug = entry.name.replace(/\.md$/, '');
    }
    if (seen.has(slug)) continue;

    const skill = await parseRemoteSkill(slug, fullPath, repoDir, sourceName, sourceUrl);
    if (skill) {
      skills.push(skill);
      seen.add(slug);
    }
  }

  return skills.sort((a, b) => a.slug.localeCompare(b.slug));
}

async function scanDir(
  dir: string,
  depth: number,
  seen: Set<string>,
  skills: RemoteSkill[],
  sourceName: string,
  sourceUrl: string,
): Promise<void> {
  if (depth > MAX_DEPTH) return;

  const entries = await fs.readdir(dir, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    if (entry.name.startsWith('.') && !ALLOWED_HIDDEN_DIRS.has(entry.name)) continue;
    if (IGNORE_DIRS.has(entry.name)) continue;
    if (!entry.isDirectory()) continue;

    const fullPath = path.join(dir, entry.name);
    const skillMd = path.join(fullPath, 'SKILL.md');

    if (await fs.pathExists(skillMd)) {
      // Directory with SKILL.md — it's a skill, don't recurse further
      const slug = resolveSlug(entry.name, skillMd);
      if (!seen.has(slug)) {
        const skill = await parseRemoteSkill(slug, skillMd, fullPath, sourceName, sourceUrl);
        if (skill) {
          skills.push(skill);
          seen.add(slug);
        }
      }
    } else {
      // No SKILL.md — organizational directory, always recurse
      await scanDir(fullPath, depth + 1, seen, skills, sourceName, sourceUrl);
    }
  }
}

/**
 * Resolve slug for a skill directory. For generic names like "skill" or "skills",
 * read frontmatter name and slugify it. Falls back to directory name.
 */
function resolveSlug(dirName: string, skillMdPath: string): string {
  if (!GENERIC_DIR_NAMES.has(dirName)) return dirName;

  try {
    const raw = fs.readFileSync(skillMdPath, 'utf-8');
    const parsed = parseSkillContent(raw);
    const name = parsed.frontmatter.name;
    if (name) {
      const derived = slugify(name);
      if (derived) return derived;
    }
  } catch {
    // Fall back to directory name
  }
  return dirName;
}

/**
 * Extract a slug from a file's frontmatter name. Returns null if no name found.
 */
function slugFromFrontmatter(filePath: string): string | null {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = parseSkillContent(raw);
    const name = parsed.frontmatter.name;
    if (name) {
      const derived = slugify(name);
      if (derived) return derived;
    }
  } catch {
    // No usable frontmatter
  }
  return null;
}

/**
 * Check if a .md file has valid skill frontmatter.
 * Accepts any recognized skill field (name, description, non-empty tags, tools,
 * depends, triggers) — not just name — so standalone skills that rely on
 * filename-derived slugs are still discovered.
 */
function hasSkillFrontmatter(filePath: string): boolean {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = parseSkillContent(raw);
    const fm = parsed.frontmatter as Record<string, unknown>;
    return !!(
      fm.name ||
      fm.description ||
      (Array.isArray(fm.tags) && fm.tags.length > 0) ||
      fm.tools ||
      fm.depends ||
      fm.triggers
    );
  } catch {
    return false;
  }
}

async function parseRemoteSkill(
  slug: string,
  filePath: string,
  dirPath: string,
  sourceName: string,
  sourceUrl: string,
): Promise<RemoteSkill | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    let name = slug;
    let description = '';
    let tags: string[] = [];

    try {
      const parsed = parseSkillContent(raw);
      name = parsed.frontmatter.name ?? slug;
      description = parsed.frontmatter.description ?? '';
      tags = parsed.frontmatter.tags ?? [];
    } catch {
      // If frontmatter parsing fails, use defaults
    }

    const installed = await fs.pathExists(skillDir(slug));

    return {
      slug,
      name,
      description,
      tags,
      sourceName,
      sourceUrl,
      filePath,
      dirPath,
      installed,
    };
  } catch {
    return null;
  }
}
