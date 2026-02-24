import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTmpSmHome, type TmpSmHome } from '../helpers/tmpdir.js';

let tmp: TmpSmHome;

beforeEach(async () => {
  tmp = await createTmpSmHome();
  vi.resetModules();
});

afterEach(async () => {
  await tmp.cleanup();
});

describe('loadSourcesRegistry', () => {
  it('returns default on fresh directory', async () => {
    const { loadSourcesRegistry, resetSourcesCache } = await import('../../src/core/sources.js');
    resetSourcesCache();

    const registry = await loadSourcesRegistry();
    expect(registry.version).toBe(1);
    expect(registry.sources).toEqual([]);
  });
});

describe('addSourceEntry', () => {
  it('persists and reloads', async () => {
    const { addSourceEntry, loadSourcesRegistry, resetSourcesCache } = await import('../../src/core/sources.js');
    resetSourcesCache();

    await addSourceEntry({
      name: 'test-source',
      url: 'https://github.com/user/repo.git',
      addedAt: new Date().toISOString(),
      skillCount: 3,
    });

    resetSourcesCache();
    const registry = await loadSourcesRegistry();
    expect(registry.sources).toHaveLength(1);
    expect(registry.sources[0].name).toBe('test-source');
    expect(registry.sources[0].skillCount).toBe(3);
  });

  it('replaces existing entry with same name', async () => {
    const { addSourceEntry, loadSourcesRegistry, resetSourcesCache } = await import('../../src/core/sources.js');
    resetSourcesCache();

    await addSourceEntry({
      name: 'test-source',
      url: 'https://github.com/user/repo.git',
      addedAt: new Date().toISOString(),
      skillCount: 3,
    });

    await addSourceEntry({
      name: 'test-source',
      url: 'https://github.com/user/repo-v2.git',
      addedAt: new Date().toISOString(),
      skillCount: 5,
    });

    resetSourcesCache();
    const registry = await loadSourcesRegistry();
    expect(registry.sources).toHaveLength(1);
    expect(registry.sources[0].url).toBe('https://github.com/user/repo-v2.git');
    expect(registry.sources[0].skillCount).toBe(5);
  });
});

describe('removeSourceEntry', () => {
  it('removes correct entry', async () => {
    const { addSourceEntry, removeSourceEntry, loadSourcesRegistry, resetSourcesCache } = await import('../../src/core/sources.js');
    resetSourcesCache();

    await addSourceEntry({
      name: 'source-a',
      url: 'https://github.com/user/a.git',
      addedAt: new Date().toISOString(),
    });
    await addSourceEntry({
      name: 'source-b',
      url: 'https://github.com/user/b.git',
      addedAt: new Date().toISOString(),
    });

    await removeSourceEntry('source-a');

    resetSourcesCache();
    const registry = await loadSourcesRegistry();
    expect(registry.sources).toHaveLength(1);
    expect(registry.sources[0].name).toBe('source-b');
  });
});

describe('getSourceEntry', () => {
  it('returns null for missing', async () => {
    const { getSourceEntry, resetSourcesCache } = await import('../../src/core/sources.js');
    resetSourcesCache();

    const entry = await getSourceEntry('nonexistent');
    expect(entry).toBeNull();
  });

  it('returns existing entry', async () => {
    const { addSourceEntry, getSourceEntry, resetSourcesCache } = await import('../../src/core/sources.js');
    resetSourcesCache();

    await addSourceEntry({
      name: 'my-source',
      url: 'https://github.com/user/repo.git',
      addedAt: new Date().toISOString(),
      skillCount: 7,
    });

    resetSourcesCache();
    const entry = await getSourceEntry('my-source');
    expect(entry).not.toBeNull();
    expect(entry!.name).toBe('my-source');
    expect(entry!.skillCount).toBe(7);
  });
});

describe('updateSourceEntry', () => {
  it('updates fields on existing entry', async () => {
    const { addSourceEntry, updateSourceEntry, getSourceEntry, resetSourcesCache } = await import('../../src/core/sources.js');
    resetSourcesCache();

    await addSourceEntry({
      name: 'test',
      url: 'https://github.com/user/repo.git',
      addedAt: new Date().toISOString(),
      skillCount: 0,
    });

    await updateSourceEntry('test', { skillCount: 10, lastSync: '2025-06-01T00:00:00.000Z' });

    resetSourcesCache();
    const entry = await getSourceEntry('test');
    expect(entry!.skillCount).toBe(10);
    expect(entry!.lastSync).toBe('2025-06-01T00:00:00.000Z');
  });
});

describe('resetSourcesCache', () => {
  it('forces reload from disk', async () => {
    const { addSourceEntry, loadSourcesRegistry, resetSourcesCache } = await import('../../src/core/sources.js');
    const fs = await import('fs-extra');
    const { SM_SOURCES_REGISTRY } = await import('../../src/fs/paths.js');
    resetSourcesCache();

    await addSourceEntry({
      name: 'cached-test',
      url: 'https://github.com/user/repo.git',
      addedAt: new Date().toISOString(),
    });

    // Manually wipe the file
    await fs.writeJson(SM_SOURCES_REGISTRY, { version: 1, sources: [] });

    // Without reset, should still return cached data
    const cached = await loadSourcesRegistry();
    expect(cached.sources).toHaveLength(1);

    // After reset, should read from disk
    resetSourcesCache();
    const fresh = await loadSourcesRegistry();
    expect(fresh.sources).toHaveLength(0);
  });
});
