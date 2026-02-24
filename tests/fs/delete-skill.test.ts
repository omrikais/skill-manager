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

async function createTestSkill(slug: string) {
  const skillsDir = path.join(tmp.smHome, 'skills', slug);
  await fs.ensureDir(skillsDir);
  await fs.writeFile(path.join(skillsDir, 'SKILL.md'), `---\nname: ${slug}\n---\nContent`);
  await fs.writeJson(path.join(skillsDir, '.sm-meta.json'), {
    format: 'skill',
    source: { type: 'created' },
    tags: [],
    deployAs: { cc: 'skill', codex: 'skill' },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  await fs.writeJson(path.join(skillsDir, '.sm-history.json'), {
    slug,
    currentVersion: 1,
    entries: [],
  });
  const refsDir = path.join(skillsDir, 'references');
  await fs.ensureDir(refsDir);
  await fs.writeFile(path.join(refsDir, 'notes.md'), 'reference content');
}

describe('deleteSkill', () => {
  it('removes canonical skill directory', async () => {
    await createTestSkill('my-skill');

    const { deleteSkill, skillExists } = await import('../../src/core/skill.js');
    const { resetStateCache } = await import('../../src/core/state.js');
    resetStateCache();

    expect(await skillExists('my-skill')).toBe(true);
    await deleteSkill('my-skill');
    expect(await skillExists('my-skill')).toBe(false);
  });

  it('removes deployed symlinks and state records', async () => {
    await createTestSkill('deployed-skill');

    const ccSkillsDir = path.join(tmp.home, '.claude', 'skills');
    await fs.ensureDir(ccSkillsDir);

    const { deploy } = await import('../../src/deploy/engine.js');
    const { resetStateCache, getLinkRecords } = await import('../../src/core/state.js');
    const { deleteSkill } = await import('../../src/core/skill.js');
    resetStateCache();

    await deploy('deployed-skill', 'cc', 'skill');
    const linksBefore = await getLinkRecords('deployed-skill');
    expect(linksBefore.length).toBeGreaterThan(0);

    // Symlink should exist (use lstat to check the link entry itself, not the target)
    const symlinkPath = path.join(ccSkillsDir, 'deployed-skill');
    const { isSymlink } = await import('../../src/fs/links.js');
    expect(await isSymlink(symlinkPath)).toBe(true);

    await deleteSkill('deployed-skill');

    // Symlink entry itself should be removed, not just the target it points to
    expect(await isSymlink(symlinkPath)).toBe(false);

    // State records should be gone
    resetStateCache();
    const linksAfter = await getLinkRecords('deployed-skill');
    expect(linksAfter).toEqual([]);
  });

  it('handles skill deployed to multiple tools', async () => {
    await createTestSkill('multi-tool');

    const ccSkillsDir = path.join(tmp.home, '.claude', 'skills');
    const codexSkillsDir = path.join(tmp.home, '.agents', 'skills');
    await fs.ensureDir(ccSkillsDir);
    await fs.ensureDir(codexSkillsDir);

    const { deploy } = await import('../../src/deploy/engine.js');
    const { resetStateCache, getLinkRecords } = await import('../../src/core/state.js');
    const { deleteSkill, skillExists } = await import('../../src/core/skill.js');
    resetStateCache();

    await deploy('multi-tool', 'cc', 'skill');
    await deploy('multi-tool', 'codex', 'skill');

    const linksBefore = await getLinkRecords('multi-tool');
    expect(linksBefore).toHaveLength(2);

    await deleteSkill('multi-tool');

    const { isSymlink } = await import('../../src/fs/links.js');
    expect(await skillExists('multi-tool')).toBe(false);
    expect(await isSymlink(path.join(ccSkillsDir, 'multi-tool'))).toBe(false);
    expect(await isSymlink(path.join(codexSkillsDir, 'multi-tool'))).toBe(false);

    resetStateCache();
    expect(await getLinkRecords('multi-tool')).toEqual([]);
  });

  it('throws SkillNotFoundError for non-existent skill', async () => {
    const { deleteSkill } = await import('../../src/core/skill.js');
    const { resetStateCache } = await import('../../src/core/state.js');
    resetStateCache();

    await expect(deleteSkill('does-not-exist')).rejects.toThrow('does-not-exist');
  });

  it('cleans up stale link records even when symlinks are already gone', async () => {
    await createTestSkill('stale-skill');

    const ccSkillsDir = path.join(tmp.home, '.claude', 'skills');
    await fs.ensureDir(ccSkillsDir);

    const { deploy } = await import('../../src/deploy/engine.js');
    const { resetStateCache, getLinkRecords } = await import('../../src/core/state.js');
    const { deleteSkill, skillExists } = await import('../../src/core/skill.js');
    resetStateCache();

    await deploy('stale-skill', 'cc', 'skill');

    // Verify link record exists
    const linksBefore = await getLinkRecords('stale-skill');
    expect(linksBefore).toHaveLength(1);

    // Manually remove the symlink to simulate stale state
    await fs.remove(path.join(ccSkillsDir, 'stale-skill'));

    // deleteSkill should still succeed and clean up stale records
    await deleteSkill('stale-skill');
    expect(await skillExists('stale-skill')).toBe(false);

    // Stale link records must be gone too
    resetStateCache();
    const linksAfter = await getLinkRecords('stale-skill');
    expect(linksAfter).toEqual([]);
  });
});
