import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTmpSmHome, type TmpSmHome } from '../../helpers/tmpdir.js';
import { createTestSkill } from '../../helpers/skill-factory.js';

let tmp: TmpSmHome;

beforeEach(async () => {
  tmp = await createTmpSmHome();
  vi.resetModules();
});

afterEach(async () => {
  await tmp.cleanup();
});

describe('SkillDetailScreen data loading', () => {
  it('can load skill data that the detail screen would display', async () => {
    await createTestSkill('detail-test', {
      name: 'Detail Test',
      description: 'A skill for detail view',
      tags: ['test', 'detail'],
    });

    // Test the data loading that SkillDetailScreen performs internally
    const { loadSkill } = await import('../../../src/core/skill.js');
    const { getLinkRecords } = await import('../../../src/core/state.js');
    const { getDirectDeps } = await import('../../../src/core/deps.js');

    const skill = await loadSkill('detail-test');
    expect(skill.name).toBe('Detail Test');
    expect(skill.slug).toBe('detail-test');
    expect(skill.description).toBe('A skill for detail view');
    expect(skill.tags).toEqual(['test', 'detail']);

    const links = await getLinkRecords('detail-test');
    expect(links).toHaveLength(0);

    const deps = await getDirectDeps('detail-test');
    expect(deps).toHaveLength(0);
  });

  it('loads dependencies and deployments for display', async () => {
    await createTestSkill('lib-detail', { name: 'Lib', description: 'A library' });
    await createTestSkill('app-detail', {
      name: 'App',
      description: 'Depends on lib',
      depends: ['lib-detail'],
    });

    const { deploy } = await import('../../../src/deploy/engine.js');
    const { resetStateCache } = await import('../../../src/core/state.js');
    resetStateCache();
    await deploy('app-detail', 'cc');

    const { loadSkill } = await import('../../../src/core/skill.js');
    const { getLinkRecords } = await import('../../../src/core/state.js');
    const { getDirectDeps, buildDepGraph, getDependents } = await import('../../../src/core/deps.js');

    const skill = await loadSkill('app-detail');
    expect(skill.name).toBe('App');

    const links = await getLinkRecords('app-detail');
    expect(links.length).toBeGreaterThan(0);
    expect(links[0].tool).toBe('cc');

    const deps = await getDirectDeps('app-detail');
    expect(deps).toEqual(['lib-detail']);

    const graph = await buildDepGraph();
    const dependents = getDependents('lib-detail', graph);
    expect(dependents).toContain('app-detail');
  });
});
