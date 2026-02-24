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

async function createTestSkill(slug: string): Promise<void> {
  const { SM_SKILLS_DIR } = await import('../../src/fs/paths.js');
  const dir = path.join(SM_SKILLS_DIR, slug);
  await fs.ensureDir(dir);

  await fs.writeFile(path.join(dir, 'SKILL.md'), `---
name: ${slug}
description: Test skill
---
# ${slug} content
`);

  await fs.writeJson(path.join(dir, '.sm-meta.json'), {
    format: 'skill',
    source: { type: 'created' },
    tags: [],
    deployAs: { cc: 'skill', codex: 'skill' },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  await fs.writeJson(path.join(dir, '.sm-history.json'), {
    slug,
    current: 1,
    entries: [],
  });

  // Add references directory
  const refsDir = path.join(dir, 'references');
  await fs.ensureDir(refsDir);
  await fs.writeFile(path.join(refsDir, 'example.txt'), 'reference content');
}

describe('publishSkill', () => {
  it('copies SKILL.md and references/', async () => {
    const { publishSkill } = await import('../../src/sources/publish.js');
    await createTestSkill('test-publish');

    const outDir = path.join(tmp.home, 'export');
    await fs.ensureDir(outDir);

    const result = await publishSkill('test-publish', outDir);

    expect(result.slug).toBe('test-publish');
    expect(result.outPath).toBe(path.join(outDir, 'test-publish'));
    expect(result.filesWritten).toContain('SKILL.md');
    expect(result.filesWritten).toContain('references/');

    // Verify files exist
    expect(await fs.pathExists(path.join(result.outPath, 'SKILL.md'))).toBe(true);
    expect(await fs.pathExists(path.join(result.outPath, 'references', 'example.txt'))).toBe(true);
  });

  it('does NOT copy .sm-meta.json or .sm-history.json', async () => {
    const { publishSkill } = await import('../../src/sources/publish.js');
    await createTestSkill('test-publish-clean');

    const outDir = path.join(tmp.home, 'export-clean');
    await fs.ensureDir(outDir);

    const result = await publishSkill('test-publish-clean', outDir);

    expect(await fs.pathExists(path.join(result.outPath, '.sm-meta.json'))).toBe(false);
    expect(await fs.pathExists(path.join(result.outPath, '.sm-history.json'))).toBe(false);
  });

  it('throws SkillNotFoundError for unknown slug', async () => {
    const { publishSkill } = await import('../../src/sources/publish.js');
    const { SkillNotFoundError } = await import('../../src/utils/errors.js');

    const outDir = path.join(tmp.home, 'export-missing');
    await fs.ensureDir(outDir);

    await expect(publishSkill('nonexistent', outDir)).rejects.toThrow(SkillNotFoundError);
  });

  it('throws SmError for existing target without overwrite', async () => {
    const { publishSkill } = await import('../../src/sources/publish.js');
    const { SmError } = await import('../../src/utils/errors.js');
    await createTestSkill('test-exists');

    const outDir = path.join(tmp.home, 'export-exists');
    await fs.ensureDir(outDir);

    // First publish succeeds
    await publishSkill('test-exists', outDir);

    // Second publish without overwrite should throw
    await expect(publishSkill('test-exists', outDir)).rejects.toThrow(SmError);
  });

  it('with overwrite replaces existing', async () => {
    const { publishSkill } = await import('../../src/sources/publish.js');
    await createTestSkill('test-overwrite');

    const outDir = path.join(tmp.home, 'export-overwrite');
    await fs.ensureDir(outDir);

    // First publish
    await publishSkill('test-overwrite', outDir);

    // Second publish with overwrite
    const result = await publishSkill('test-overwrite', outDir, true);
    expect(result.filesWritten).toContain('SKILL.md');
    expect(await fs.pathExists(path.join(result.outPath, 'SKILL.md'))).toBe(true);
  });

  it('with overwrite removes stale files from previous export', async () => {
    const { publishSkill } = await import('../../src/sources/publish.js');
    const { SM_SKILLS_DIR } = await import('../../src/fs/paths.js');
    await createTestSkill('test-stale');

    const outDir = path.join(tmp.home, 'export-stale');
    await fs.ensureDir(outDir);

    // First publish (includes references/)
    const first = await publishSkill('test-stale', outDir);
    expect(await fs.pathExists(path.join(first.outPath, 'references', 'example.txt'))).toBe(true);

    // Remove references/ from the source skill
    await fs.remove(path.join(SM_SKILLS_DIR, 'test-stale', 'references'));

    // Second publish with overwrite — stale references/ should be gone
    const second = await publishSkill('test-stale', outDir, true);
    expect(second.filesWritten).not.toContain('references/');
    expect(await fs.pathExists(path.join(second.outPath, 'references'))).toBe(false);
    expect(await fs.pathExists(path.join(second.outPath, 'SKILL.md'))).toBe(true);
  });
});
