import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { createTmpSmHome, type TmpSmHome } from '../helpers/tmpdir.js';

let tmp: TmpSmHome;

beforeEach(async () => {
  tmp = await createTmpSmHome();
  vi.resetModules();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(async () => {
  vi.restoreAllMocks();
  await tmp.cleanup();
});

describe('full skill lifecycle: create → deploy → edit → rollback → undeploy → delete', () => {
  it('completes the entire lifecycle', async () => {
    const ccSkillsDir = path.join(tmp.home, '.claude', 'skills');
    const codexSkillsDir = path.join(tmp.home, '.agents', 'skills');
    await fs.ensureDir(ccSkillsDir);
    await fs.ensureDir(codexSkillsDir);

    // --- 1. Create ---
    const { createCommand } = await import('../../src/commands/create.js');
    const { skillDir, skillFile } = await import('../../src/fs/paths.js');
    const { resetStateCache, getLinkRecords } = await import('../../src/core/state.js');
    const { skillExists } = await import('../../src/core/skill.js');
    const { isSymlink } = await import('../../src/fs/links.js');
    resetStateCache();

    const slug = 'lifecycle-test';
    await createCommand('Lifecycle Test', {});

    expect(await fs.pathExists(skillDir(slug))).toBe(true);
    expect(await fs.pathExists(skillFile(slug))).toBe(true);
    const metaPath = path.join(skillDir(slug), '.sm-meta.json');
    expect(await fs.pathExists(metaPath)).toBe(true);

    // --- 2. Deploy to CC ---
    const { deploy, undeploy } = await import('../../src/deploy/engine.js');

    const deployResult = await deploy(slug, 'cc', 'skill');
    expect(deployResult.action).toBe('deployed');
    expect(await isSymlink(path.join(ccSkillsDir, slug))).toBe(true);

    const linksAfterDeploy = await getLinkRecords(slug);
    expect(linksAfterDeploy).toHaveLength(1);

    // --- 3. Edit + version ---
    const originalContent = await fs.readFile(skillFile(slug), 'utf-8');
    const editedContent = originalContent + '\n## Edited\nNew section added.\n';
    await fs.writeFile(skillFile(slug), editedContent, 'utf-8');

    const { recordVersion, loadHistory } = await import('../../src/core/versioning.js');
    const entry = await recordVersion(slug, 'edit');
    expect(entry).not.toBeNull();

    const history = await loadHistory(slug);
    expect(history.entries.length).toBeGreaterThanOrEqual(2);

    // --- 4. Rollback ---
    const { rollbackToVersion } = await import('../../src/core/versioning.js');
    await rollbackToVersion(slug, 1);

    const restoredContent = await fs.readFile(skillFile(slug), 'utf-8');
    expect(restoredContent).toBe(originalContent);

    // --- 5. Undeploy ---
    const undeployResult = await undeploy(slug, 'cc');
    expect(undeployResult.action).toBe('undeployed');
    expect(await isSymlink(path.join(ccSkillsDir, slug))).toBe(false);

    resetStateCache();
    const linksAfterUndeploy = await getLinkRecords(slug);
    expect(linksAfterUndeploy).toHaveLength(0);

    // --- 6. Delete ---
    const { deleteSkill } = await import('../../src/core/skill.js');
    await deleteSkill(slug);
    expect(await skillExists(slug)).toBe(false);
  });
});

describe('multi-skill dependency workflow', () => {
  async function createTestSkill(
    slug: string,
    opts?: { depends?: string[] },
  ) {
    const skillsDir = path.join(tmp.smHome, 'skills', slug);
    await fs.ensureDir(skillsDir);

    const depends = opts?.depends ?? [];
    const frontmatter = depends.length > 0
      ? `---\nname: ${slug}\ndepends: [${depends.join(', ')}]\n---\n`
      : `---\nname: ${slug}\n---\n`;

    await fs.writeFile(path.join(skillsDir, 'SKILL.md'), `${frontmatter}Content for ${slug}`);
    await fs.writeJson(path.join(skillsDir, '.sm-meta.json'), {
      format: 'skill',
      source: { type: 'created' },
      tags: [],
      deployAs: { cc: 'skill', codex: 'skill' },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  it('deploys dependencies via addCommand and blocks removal of a dependency', async () => {
    const ccSkillsDir = path.join(tmp.home, '.claude', 'skills');
    const codexSkillsDir = path.join(tmp.home, '.agents', 'skills');
    await fs.ensureDir(ccSkillsDir);
    await fs.ensureDir(codexSkillsDir);

    await createTestSkill('skill-a');
    await createTestSkill('skill-b', { depends: ['skill-a'] });

    const { addCommand } = await import('../../src/commands/add.js');
    const { removeCommand } = await import('../../src/commands/remove.js');
    const { getLinkRecords, resetStateCache } = await import('../../src/core/state.js');
    resetStateCache();

    // --- Deploy skill-b (should auto-deploy skill-a) ---
    await addCommand('skill-b', {});

    const bRecords = await getLinkRecords('skill-b');
    expect(bRecords.length).toBeGreaterThan(0);

    const aRecords = await getLinkRecords('skill-a');
    expect(aRecords.length).toBeGreaterThan(0);

    // --- Attempt to remove skill-a (should fail — skill-b depends on it) ---
    await expect(removeCommand('skill-a', {})).rejects.toThrow('deployed skills depend on it');

    // --- Force remove succeeds ---
    await expect(removeCommand('skill-a', { force: true })).resolves.not.toThrow();
  });
});
