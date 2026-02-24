import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { createTmpSmHome, type TmpSmHome } from '../helpers/tmpdir.js';

let tmp: TmpSmHome;

beforeEach(async () => {
  tmp = await createTmpSmHome();
  vi.resetModules();
});

afterEach(async () => {
  await tmp.cleanup();
});

describe('loadState', () => {
  it('returns default state on fresh directory', async () => {
    const { loadState, resetStateCache } = await import('../../src/core/state.js');
    resetStateCache();

    const state = await loadState();
    expect(state.version).toBe(1);
    expect(state.links).toEqual([]);
  });

  it('round-trips save/load', async () => {
    const { loadState, saveState, resetStateCache } = await import('../../src/core/state.js');
    resetStateCache();

    const state = await loadState();
    state.links.push({
      slug: 'test-skill',
      tool: 'cc',
      format: 'legacy-command',
      linkPath: '/some/link',
      targetPath: '/some/target',
      createdAt: new Date().toISOString(),
    });
    await saveState(state);

    // Reset cache and reload
    resetStateCache();
    const reloaded = await loadState();
    expect(reloaded.links).toHaveLength(1);
    expect(reloaded.links[0].slug).toBe('test-skill');
  });
});

describe('addLinkRecord', () => {
  it('adds a new record', async () => {
    const { addLinkRecord, getLinkRecords, resetStateCache } = await import('../../src/core/state.js');
    resetStateCache();

    await addLinkRecord({
      slug: 'foo',
      tool: 'cc',
      format: 'legacy-command',
      linkPath: '/a',
      targetPath: '/b',
      createdAt: new Date().toISOString(),
    });

    const records = await getLinkRecords('foo');
    expect(records).toHaveLength(1);
    expect(records[0].slug).toBe('foo');
  });

  it('deduplicates by slug+tool', async () => {
    const { addLinkRecord, getLinkRecords, resetStateCache } = await import('../../src/core/state.js');
    resetStateCache();

    const base = {
      slug: 'foo',
      tool: 'cc' as const,
      format: 'legacy-command' as const,
      createdAt: new Date().toISOString(),
    };

    await addLinkRecord({ ...base, linkPath: '/a1', targetPath: '/b1' });
    await addLinkRecord({ ...base, linkPath: '/a2', targetPath: '/b2' });

    const records = await getLinkRecords('foo');
    expect(records).toHaveLength(1);
    expect(records[0].linkPath).toBe('/a2');
  });
});

describe('removeLinkRecord', () => {
  it('removes a record', async () => {
    const { addLinkRecord, removeLinkRecord, getLinkRecords, resetStateCache } = await import('../../src/core/state.js');
    resetStateCache();

    await addLinkRecord({
      slug: 'foo',
      tool: 'cc',
      format: 'legacy-command',
      linkPath: '/a',
      targetPath: '/b',
      createdAt: new Date().toISOString(),
    });

    await removeLinkRecord('foo', 'cc');
    const records = await getLinkRecords('foo');
    expect(records).toHaveLength(0);
  });

  it('is a no-op for nonexistent record', async () => {
    const { removeLinkRecord, getLinkRecords, resetStateCache } = await import('../../src/core/state.js');
    resetStateCache();

    await removeLinkRecord('nonexistent', 'cc');
    const records = await getLinkRecords();
    expect(records).toHaveLength(0);
  });
});

describe('scope-aware operations', () => {
  it('records without scope field parse and normalize to user', async () => {
    const { loadState, saveState, resetStateCache } = await import('../../src/core/state.js');
    resetStateCache();

    // Write state with a record lacking scope (simulating old data)
    const state = await loadState();
    state.links.push({
      slug: 'old-skill',
      tool: 'cc',
      format: 'legacy-command',
      linkPath: '/a',
      targetPath: '/b',
      createdAt: new Date().toISOString(),
    });
    await saveState(state);

    resetStateCache();
    const reloaded = await loadState();
    expect(reloaded.links[0].scope).toBeUndefined();
    // Normalized via ?? 'user'
    expect(reloaded.links[0].scope ?? 'user').toBe('user');
  });

  it('project-scoped record coexists with user-scoped record for same slug+tool', async () => {
    const { addLinkRecord, getLinkRecords, resetStateCache } = await import('../../src/core/state.js');
    resetStateCache();

    const base = {
      slug: 'foo',
      tool: 'cc' as const,
      format: 'skill' as const,
      createdAt: new Date().toISOString(),
    };

    // Add user-scoped
    await addLinkRecord({ ...base, linkPath: '/user/a', targetPath: '/b' });
    // Add project-scoped
    await addLinkRecord({ ...base, linkPath: '/project/a', targetPath: '/b', scope: 'project', projectRoot: '/tmp/proj' });

    const all = await getLinkRecords('foo');
    expect(all).toHaveLength(2);
  });

  it('deduplicates project-scoped records by slug+tool+scope+projectRoot', async () => {
    const { addLinkRecord, getLinkRecords, resetStateCache } = await import('../../src/core/state.js');
    resetStateCache();

    const base = {
      slug: 'foo',
      tool: 'cc' as const,
      format: 'skill' as const,
      scope: 'project' as const,
      projectRoot: '/tmp/proj',
      createdAt: new Date().toISOString(),
    };

    await addLinkRecord({ ...base, linkPath: '/a1', targetPath: '/b1' });
    await addLinkRecord({ ...base, linkPath: '/a2', targetPath: '/b2' });

    const all = await getLinkRecords('foo');
    expect(all).toHaveLength(1);
    expect(all[0].linkPath).toBe('/a2');
  });

  it('removeLinkRecord with project scope only removes project record', async () => {
    const { addLinkRecord, removeLinkRecord, getLinkRecords, resetStateCache } = await import('../../src/core/state.js');
    resetStateCache();

    const base = {
      slug: 'foo',
      tool: 'cc' as const,
      format: 'skill' as const,
      createdAt: new Date().toISOString(),
    };

    // Add user and project records
    await addLinkRecord({ ...base, linkPath: '/user/a', targetPath: '/b' });
    await addLinkRecord({ ...base, linkPath: '/project/a', targetPath: '/b', scope: 'project', projectRoot: '/tmp/proj' });

    // Remove only project record
    await removeLinkRecord('foo', 'cc', 'project', '/tmp/proj');

    const all = await getLinkRecords('foo');
    expect(all).toHaveLength(1);
    expect(all[0].scope ?? 'user').toBe('user');
  });

  it('getLinkRecords filters by scope', async () => {
    const { addLinkRecord, getLinkRecords, resetStateCache } = await import('../../src/core/state.js');
    resetStateCache();

    const base = {
      slug: 'foo',
      tool: 'cc' as const,
      format: 'skill' as const,
      createdAt: new Date().toISOString(),
    };

    await addLinkRecord({ ...base, linkPath: '/user/a', targetPath: '/b' });
    await addLinkRecord({ ...base, linkPath: '/proj/a', targetPath: '/b', scope: 'project', projectRoot: '/tmp/proj' });

    const userLinks = await getLinkRecords('foo', { scope: 'user' });
    expect(userLinks).toHaveLength(1);
    expect(userLinks[0].linkPath).toBe('/user/a');

    const projectLinks = await getLinkRecords('foo', { scope: 'project' });
    expect(projectLinks).toHaveLength(1);
    expect(projectLinks[0].linkPath).toBe('/proj/a');
  });

  it('getLinkRecords filters by projectRoot', async () => {
    const { addLinkRecord, getLinkRecords, resetStateCache } = await import('../../src/core/state.js');
    resetStateCache();

    const base = {
      slug: 'foo',
      tool: 'cc' as const,
      format: 'skill' as const,
      scope: 'project' as const,
      createdAt: new Date().toISOString(),
    };

    await addLinkRecord({ ...base, linkPath: '/a', targetPath: '/b', projectRoot: '/tmp/proj1' });
    await addLinkRecord({ ...base, linkPath: '/c', targetPath: '/d', projectRoot: '/tmp/proj2' });

    const proj1 = await getLinkRecords('foo', { scope: 'project', projectRoot: '/tmp/proj1' });
    expect(proj1).toHaveLength(1);
    expect(proj1[0].projectRoot).toBe('/tmp/proj1');

    const proj2 = await getLinkRecords('foo', { scope: 'project', projectRoot: '/tmp/proj2' });
    expect(proj2).toHaveLength(1);
    expect(proj2[0].projectRoot).toBe('/tmp/proj2');
  });
});

describe('updateLastSync', () => {
  it('updates the lastSync timestamp', async () => {
    const { loadState, updateLastSync, resetStateCache } = await import('../../src/core/state.js');
    resetStateCache();

    await updateLastSync();
    resetStateCache();
    const state = await loadState();
    expect(state.lastSync).toBeDefined();
    expect(typeof state.lastSync).toBe('string');
  });
});
