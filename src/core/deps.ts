import { listSlugs, loadSkill } from './skill.js';
export interface DepGraph {
  edges: Map<string, string[]>;
}

export interface ResolvedDeps {
  ordered: string[];
  missing: string[];
  circular: string[] | null;
}

/**
 * Get direct dependencies from a skill's frontmatter `depends` field.
 */
export async function getDirectDeps(slug: string): Promise<string[]> {
  const skill = await loadSkill(slug);
  const fm = skill.content.frontmatter as Record<string, unknown>;
  const deps = fm.depends;
  if (Array.isArray(deps)) {
    return deps.filter((d): d is string => typeof d === 'string');
  }
  return [];
}

/**
 * Build a dependency graph from all (or specified) skills.
 */
export async function buildDepGraph(slugs?: string[]): Promise<DepGraph> {
  const allSlugs = slugs ?? (await listSlugs());
  const edges = new Map<string, string[]>();

  for (const slug of allSlugs) {
    try {
      const deps = await getDirectDeps(slug);
      edges.set(slug, deps);
    } catch {
      edges.set(slug, []);
    }
  }

  return { edges };
}

/**
 * Build a dependency graph from pre-loaded skill data (no I/O).
 */
export function buildDepGraphFromData(skills: Array<{ slug: string; depends: string[] }>): DepGraph {
  const edges = new Map<string, string[]>();
  for (const s of skills) {
    edges.set(s.slug, s.depends);
  }
  return { edges };
}

/**
 * Resolve dependencies for a slug in topological order.
 * Returns deps first, target last.
 */
export function resolveDeps(slug: string, graph: DepGraph): ResolvedDeps {
  const cycle = detectCycle(slug, graph);
  if (cycle) {
    return { ordered: [], missing: [], circular: cycle };
  }

  const visited = new Set<string>();
  const ordered: string[] = [];
  const missing: string[] = [];

  function visit(s: string) {
    if (visited.has(s)) return;
    visited.add(s);

    const deps = graph.edges.get(s) ?? [];
    for (const dep of deps) {
      if (!graph.edges.has(dep)) {
        if (!missing.includes(dep)) missing.push(dep);
      } else {
        visit(dep);
      }
    }
    ordered.push(s);
  }

  visit(slug);
  return { ordered, missing, circular: null };
}

/**
 * Get skills that depend on the given slug (reverse lookup).
 */
export function getDependents(slug: string, graph: DepGraph): string[] {
  const dependents: string[] = [];
  for (const [s, deps] of graph.edges) {
    if (deps.includes(slug)) {
      dependents.push(s);
    }
  }
  return dependents;
}

/**
 * Detect cycles starting from the given slug. Returns the cycle path or null.
 */
export function detectCycle(slug: string, graph: DepGraph): string[] | null {
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function dfs(s: string, path: string[]): string[] | null {
    if (visiting.has(s)) {
      const cycleStart = path.indexOf(s);
      return [...path.slice(cycleStart), s];
    }
    if (visited.has(s)) return null;

    visiting.add(s);
    path.push(s);

    const deps = graph.edges.get(s) ?? [];
    for (const dep of deps) {
      const cycle = dfs(dep, path);
      if (cycle) return cycle;
    }

    path.pop();
    visiting.delete(s);
    visited.add(s);
    return null;
  }

  return dfs(slug, []);
}
