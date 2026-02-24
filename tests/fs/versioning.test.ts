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

async function createTestSkill(slug: string, content: string) {
  const { skillDir, skillFile } = await import('../../src/fs/paths.js');
  await fs.ensureDir(skillDir(slug));
  await fs.writeFile(skillFile(slug), content, 'utf-8');
  // Write minimal meta so other calls don't fail
  const metaPath = (await import('../../src/fs/paths.js')).skillMetaFile(slug);
  await fs.writeJson(metaPath, {
    format: 'skill',
    source: { type: 'created' },
    tags: [],
    deployAs: { cc: 'skill', codex: 'skill' },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

describe('recordVersion', () => {
  it('creates the first version entry', async () => {
    const { recordVersion, loadHistory } = await import('../../src/core/versioning.js');
    await createTestSkill('test-skill', '# Test v1\n');

    const entry = await recordVersion('test-skill', 'initial');
    expect(entry).not.toBeNull();
    expect(entry!.version).toBe(1);
    expect(entry!.message).toBe('initial');

    const history = await loadHistory('test-skill');
    expect(history.current).toBe(1);
    expect(history.entries).toHaveLength(1);
  });

  it('increments version on content change', async () => {
    const { recordVersion, loadHistory } = await import('../../src/core/versioning.js');
    const { skillFile } = await import('../../src/fs/paths.js');
    await createTestSkill('test-skill', '# Test v1\n');

    await recordVersion('test-skill', 'v1');
    await fs.writeFile(skillFile('test-skill'), '# Test v2\n', 'utf-8');
    const entry = await recordVersion('test-skill', 'v2');

    expect(entry!.version).toBe(2);
    const history = await loadHistory('test-skill');
    expect(history.current).toBe(2);
    expect(history.entries).toHaveLength(2);
  });

  it('skips recording when content unchanged', async () => {
    const { recordVersion, loadHistory } = await import('../../src/core/versioning.js');
    await createTestSkill('test-skill', '# Test\n');

    await recordVersion('test-skill', 'first');
    const entry = await recordVersion('test-skill', 'duplicate');

    expect(entry).toBeNull();
    const history = await loadHistory('test-skill');
    expect(history.entries).toHaveLength(1);
  });
});

describe('rollbackToVersion', () => {
  it('restores content from a previous version', async () => {
    const { recordVersion, rollbackToVersion } = await import('../../src/core/versioning.js');
    const { skillFile } = await import('../../src/fs/paths.js');
    await createTestSkill('test-skill', '# Original\n');

    await recordVersion('test-skill', 'v1');
    await fs.writeFile(skillFile('test-skill'), '# Modified\n', 'utf-8');
    await recordVersion('test-skill', 'v2');

    await rollbackToVersion('test-skill', 1);

    const restored = await fs.readFile(skillFile('test-skill'), 'utf-8');
    expect(restored).toBe('# Original\n');
  });

  it('records a new forward entry after rollback', async () => {
    const { recordVersion, rollbackToVersion, loadHistory } = await import('../../src/core/versioning.js');
    const { skillFile } = await import('../../src/fs/paths.js');
    await createTestSkill('test-skill', '# Original\n');

    await recordVersion('test-skill', 'v1');
    await fs.writeFile(skillFile('test-skill'), '# Modified\n', 'utf-8');
    await recordVersion('test-skill', 'v2');
    await rollbackToVersion('test-skill', 1);

    const history = await loadHistory('test-skill');
    expect(history.current).toBe(3);
    expect(history.entries).toHaveLength(3);
    expect(history.entries[2].message).toBe('rollback to v1');
  });

  it('defaults to previous version when no version specified', async () => {
    const { recordVersion, rollbackToVersion } = await import('../../src/core/versioning.js');
    const { skillFile } = await import('../../src/fs/paths.js');
    await createTestSkill('test-skill', '# v1\n');

    await recordVersion('test-skill', 'v1');
    await fs.writeFile(skillFile('test-skill'), '# v2\n', 'utf-8');
    await recordVersion('test-skill', 'v2');

    await rollbackToVersion('test-skill');

    const restored = await fs.readFile(skillFile('test-skill'), 'utf-8');
    expect(restored).toBe('# v1\n');
  });

  it('throws on empty history', async () => {
    const { rollbackToVersion } = await import('../../src/core/versioning.js');
    await createTestSkill('test-skill', '# Test\n');

    await expect(rollbackToVersion('test-skill')).rejects.toThrow('No version history');
  });

  it('throws on invalid version number', async () => {
    const { recordVersion, rollbackToVersion } = await import('../../src/core/versioning.js');
    await createTestSkill('test-skill', '# Test\n');
    await recordVersion('test-skill', 'v1');

    await expect(rollbackToVersion('test-skill', 99)).rejects.toThrow('Version 99 not found');
  });
});

describe('saveHistory', () => {
  it('creates parent directory if it does not exist', async () => {
    const { saveHistory } = await import('../../src/core/versioning.js');
    const { skillHistoryFile } = await import('../../src/fs/paths.js');

    const slug = 'nonexistent-dir-skill';
    // Do NOT create the skill directory — saveHistory should handle it
    const histPath = skillHistoryFile(slug);
    expect(await fs.pathExists(histPath)).toBe(false);

    const history = { slug, current: 1, entries: [] };
    await saveHistory(slug, history);

    expect(await fs.pathExists(histPath)).toBe(true);
    const saved = await fs.readJson(histPath);
    expect(saved.slug).toBe(slug);
  });
});

describe('writeMeta', () => {
  it('creates parent directory if it does not exist', async () => {
    const { writeMeta, createMeta } = await import('../../src/core/meta.js');
    const { skillMetaFile } = await import('../../src/fs/paths.js');

    const slug = 'no-dir-meta-skill';
    const metaPath = skillMetaFile(slug);
    expect(await fs.pathExists(metaPath)).toBe(false);

    const meta = createMeta({
      source: { type: 'created' },
      deployAs: { cc: 'skill', codex: 'skill' },
    });
    await writeMeta(slug, meta);

    expect(await fs.pathExists(metaPath)).toBe(true);
    const saved = await fs.readJson(metaPath);
    expect(saved.source.type).toBe('created');
  });
});

describe('hasContentChanged', () => {
  it('returns true when no history exists', async () => {
    const { hasContentChanged } = await import('../../src/core/versioning.js');
    await createTestSkill('test-skill', '# Test\n');

    expect(await hasContentChanged('test-skill')).toBe(true);
  });

  it('returns false when content matches latest version', async () => {
    const { recordVersion, hasContentChanged } = await import('../../src/core/versioning.js');
    await createTestSkill('test-skill', '# Test\n');
    await recordVersion('test-skill');

    expect(await hasContentChanged('test-skill')).toBe(false);
  });

  it('returns true when content differs from latest version', async () => {
    const { recordVersion, hasContentChanged } = await import('../../src/core/versioning.js');
    const { skillFile } = await import('../../src/fs/paths.js');
    await createTestSkill('test-skill', '# Test\n');
    await recordVersion('test-skill');

    await fs.writeFile(skillFile('test-skill'), '# Changed\n', 'utf-8');
    expect(await hasContentChanged('test-skill')).toBe(true);
  });
});
