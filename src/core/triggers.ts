import fg from 'fast-glob';
import path from 'path';
import { z } from 'zod';
import { listSkills, type Skill } from './skill.js';
import { getDirectDeps } from './deps.js';
import { getLinkRecords } from './state.js';
import { readMeta } from './meta.js';

export interface ProjectSignals {
  files: string[];
  dirs: string[];
  languages: string[];
}

export interface SkillSuggestion {
  slug: string;
  name: string;
  description: string;
  matchedTriggers: string[];
  confidence: 'high' | 'medium' | 'low';
  isDeployed: boolean;
  depends: string[];
}

export const TriggerSchema = z.object({
  files: z.array(z.string()).default([]),
  dirs: z.array(z.string()).default([]),
}).optional();

const EXT_TO_LANGUAGE: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.py': 'python',
  '.rs': 'rust',
  '.go': 'go',
  '.rb': 'ruby',
  '.java': 'java',
  '.kt': 'kotlin',
  '.swift': 'swift',
  '.c': 'c',
  '.cpp': 'cpp',
  '.cs': 'csharp',
  '.php': 'php',
  '.ex': 'elixir',
  '.exs': 'elixir',
  '.zig': 'zig',
  '.lua': 'lua',
  '.sh': 'shell',
  '.bash': 'shell',
  '.zsh': 'shell',
};

/**
 * Scan a project directory for signals (files, dirs, languages).
 * Looks at top 2 directory levels, skips common generated/vendored directories.
 */
export async function scanProjectSignals(projectRoot: string): Promise<ProjectSignals> {
  const entries = await fg(['**'], {
    cwd: projectRoot,
    deep: 2,
    onlyFiles: false,
    markDirectories: true,
    ignore: [
      'node_modules/**', '.git/**', 'dist/**', 'build/**', '.next/**',
      'target/**', '.venv/**', 'venv/**', '__pycache__/**', '.tox/**',
      'coverage/**', '.cache/**', '.output/**', '.turbo/**', '.parcel-cache/**',
    ],
    dot: true,
  });

  const files: string[] = [];
  const dirs: string[] = [];
  const langSet = new Set<string>();

  for (const entry of entries) {
    if (entry.endsWith('/')) {
      dirs.push(entry.slice(0, -1));
    } else {
      files.push(entry);
      const ext = path.extname(entry).toLowerCase();
      const lang = EXT_TO_LANGUAGE[ext];
      if (lang) langSet.add(lang);
    }
  }

  return {
    files,
    dirs,
    languages: [...langSet],
  };
}

/**
 * Match skill triggers against project signals.
 */
export async function matchSkillTriggers(
  signals: ProjectSignals,
  skills?: Skill[],
  projectRoot?: string,
): Promise<SkillSuggestion[]> {
  const allSkills = skills ?? await listSkills();
  const suggestions: SkillSuggestion[] = [];

  for (const skill of allSkills) {
    const fm = skill.content.frontmatter as Record<string, unknown>;
    const rawTriggers = fm.triggers;
    if (!rawTriggers || typeof rawTriggers !== 'object') continue;

    const parsed = TriggerSchema.safeParse(rawTriggers);
    if (!parsed.success || !parsed.data) continue;

    const triggers = parsed.data;
    const allPatterns = [...triggers.files, ...triggers.dirs];
    if (allPatterns.length === 0) continue;

    const matched: string[] = [];

    // Match file patterns
    for (const pattern of triggers.files) {
      const isMatch = signals.files.some((f) => matchGlob(f, pattern));
      if (isMatch) matched.push(pattern);
    }

    // Match dir patterns
    for (const pattern of triggers.dirs) {
      const isMatch = signals.dirs.some((d) => matchGlob(d, pattern));
      if (isMatch) matched.push(pattern);
    }

    if (matched.length === 0) continue;

    const confidence = scoreSuggestion(matched.length, allPatterns.length);
    const allLinks = await getLinkRecords(skill.slug);
    // Filter to user-scope + current-project-scope links only
    const links = allLinks.filter((l) => {
      const s = l.scope ?? 'user';
      if (s === 'user') return true;
      return projectRoot != null && l.projectRoot === projectRoot;
    });
    // Determine deployment status:
    // - Project-scope links: any link counts (deployAs doesn't apply to project scope)
    // - User-scope links: check all deployAs target tools are covered
    const userLinks = links.filter((l) => (l.scope ?? 'user') === 'user');
    const projectLinks = links.filter((l) => l.scope === 'project');
    let isDeployed = false;
    if (projectLinks.length > 0) {
      isDeployed = true;
    } else if (userLinks.length > 0) {
      try {
        const meta = await readMeta(skill.slug);
        const targetTools: string[] = [];
        if (meta.deployAs.cc !== 'none') targetTools.push('cc');
        if (meta.deployAs.codex !== 'none') targetTools.push('codex');
        isDeployed = targetTools.length > 0 && targetTools.every(
          (tool) => userLinks.some((l) => l.tool === tool),
        );
      } catch {
        isDeployed = true;
      }
    }

    let deps: string[] = [];
    try {
      deps = await getDirectDeps(skill.slug);
    } catch {
      // ignore
    }

    suggestions.push({
      slug: skill.slug,
      name: skill.name,
      description: skill.description,
      matchedTriggers: matched,
      confidence,
      isDeployed,
      depends: deps,
    });
  }

  // Sort by confidence (high first)
  const order = { high: 0, medium: 1, low: 2 };
  suggestions.sort((a, b) => order[a.confidence] - order[b.confidence]);

  return suggestions;
}

export function scoreSuggestion(matchCount: number, totalTriggers: number): 'high' | 'medium' | 'low' {
  if (totalTriggers === 0) return 'low';
  const ratio = matchCount / totalTriggers;
  if (ratio >= 0.75) return 'high';
  if (ratio >= 0.33) return 'medium';
  return 'low';
}

/**
 * Simple glob matching: supports * wildcard and exact match.
 */
function matchGlob(value: string, pattern: string): boolean {
  // Exact match
  if (value === pattern) return true;

  // Basename match (e.g., "Cargo.toml" matches "src/Cargo.toml")
  const basename = path.basename(value);
  if (basename === pattern) return true;

  // Simple wildcard: *.ext
  if (pattern.startsWith('*')) {
    const suffix = pattern.slice(1);
    return value.endsWith(suffix) || basename.endsWith(suffix);
  }

  return false;
}
