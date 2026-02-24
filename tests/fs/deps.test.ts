import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs-extra';
import { createTmpSmHome, type TmpSmHome } from '../helpers/tmpdir.js';

let tmp: TmpSmHome;

beforeEach(async () => {
  tmp = await createTmpSmHome();
  vi.resetModules();
});

afterEach(async () => {
  await tmp.cleanup();
});

async function createTestSkill(slug: string, frontmatter: Record<string, unknown>, body: string = '') {
  const { skillDir, skillFile, skillMetaFile } = await import('../../src/fs/paths.js');
  await fs.ensureDir(skillDir(slug));

  // Build YAML frontmatter
  const lines = ['---'];
  for (const [key, value] of Object.entries(frontmatter)) {
    if (Array.isArray(value)) {
      lines.push(`${key}: [${value.map((v) => `"${v}"`).join(', ')}]`);
    } else {
      lines.push(`${key}: "${value}"`);
    }
  }
  lines.push('---', '', body || `# ${slug}`);
  await fs.writeFile(skillFile(slug), lines.join('\n'), 'utf-8');

  await fs.writeJson(skillMetaFile(slug), {
    format: 'skill',
    source: { type: 'created' },
    tags: [],
    deployAs: { cc: 'skill', codex: 'skill' },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

describe('buildDepGraph (filesystem)', () => {
  it('reads depends from frontmatter', async () => {
    const { buildDepGraph } = await import('../../src/core/deps.js');
    await createTestSkill('lib-a', { name: 'Lib A', depends: ['lib-b'] });
    await createTestSkill('lib-b', { name: 'Lib B' });

    const graph = await buildDepGraph();
    expect(graph.edges.get('lib-a')).toEqual(['lib-b']);
    expect(graph.edges.get('lib-b')).toEqual([]);
  });

  it('handles skills with no depends field', async () => {
    const { buildDepGraph } = await import('../../src/core/deps.js');
    await createTestSkill('solo', { name: 'Solo Skill' });

    const graph = await buildDepGraph();
    expect(graph.edges.get('solo')).toEqual([]);
  });
});

describe('getDirectDeps (filesystem)', () => {
  it('returns depends array from frontmatter', async () => {
    const { getDirectDeps } = await import('../../src/core/deps.js');
    await createTestSkill('consumer', { name: 'Consumer', depends: ['dep-a', 'dep-b'] });

    const deps = await getDirectDeps('consumer');
    expect(deps).toEqual(['dep-a', 'dep-b']);
  });

  it('returns empty array when no depends', async () => {
    const { getDirectDeps } = await import('../../src/core/deps.js');
    await createTestSkill('standalone', { name: 'Standalone' });

    const deps = await getDirectDeps('standalone');
    expect(deps).toEqual([]);
  });
});

describe('resolveDeps (filesystem)', () => {
  it('resolves a chain of real skills', async () => {
    const { buildDepGraph, resolveDeps } = await import('../../src/core/deps.js');
    await createTestSkill('app', { name: 'App', depends: ['middleware'] });
    await createTestSkill('middleware', { name: 'Middleware', depends: ['core'] });
    await createTestSkill('core', { name: 'Core' });

    const graph = await buildDepGraph();
    const result = resolveDeps('app', graph);

    expect(result.circular).toBeNull();
    expect(result.missing).toEqual([]);
    expect(result.ordered).toEqual(['core', 'middleware', 'app']);
  });

  it('reports missing deps for skills not in store', async () => {
    const { buildDepGraph, resolveDeps } = await import('../../src/core/deps.js');
    await createTestSkill('consumer', { name: 'Consumer', depends: ['nonexistent'] });

    const graph = await buildDepGraph();
    const result = resolveDeps('consumer', graph);

    expect(result.missing).toEqual(['nonexistent']);
  });
});
