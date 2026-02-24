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

async function createTestSkill(slug: string, opts?: { depends?: string[] }) {
  const skillsDir = path.join(tmp.smHome, 'skills', slug);
  await fs.ensureDir(skillsDir);
  const frontmatter = opts?.depends
    ? `---\nname: ${slug}\ndepends: [${opts.depends.join(', ')}]\n---\n`
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

describe('deployToProject', () => {
  it('deploys to project directory and creates symlink', async () => {
    await createTestSkill('test-skill');

    const projectRoot = path.join(tmp.home, 'my-project');
    await fs.ensureDir(projectRoot);

    const { deployToProject } = await import('../../src/deploy/engine.js');
    const { resetStateCache } = await import('../../src/core/state.js');
    resetStateCache();

    const result = await deployToProject('test-skill', 'cc', projectRoot);
    expect(result.action).toBe('deployed');
    expect(result.scope).toBe('project');
    expect(result.projectRoot).toBe(fs.realpathSync(projectRoot));

    // Verify symlink exists
    const linkPath = path.join(projectRoot, '.claude', 'skills', 'test-skill');
    const stat = await fs.lstat(linkPath);
    expect(stat.isSymbolicLink()).toBe(true);
  });

  it('records project-scoped state', async () => {
    await createTestSkill('test-skill');
    const projectRoot = path.join(tmp.home, 'my-project');
    await fs.ensureDir(projectRoot);

    const { deployToProject } = await import('../../src/deploy/engine.js');
    const { getLinkRecords, resetStateCache } = await import('../../src/core/state.js');
    resetStateCache();

    await deployToProject('test-skill', 'cc', projectRoot);

    const records = await getLinkRecords('test-skill', { scope: 'project' });
    expect(records).toHaveLength(1);
    expect(records[0].scope).toBe('project');
    expect(records[0].projectRoot).toBe(fs.realpathSync(projectRoot));
  });

  it('is idempotent — deploying twice creates one record', async () => {
    await createTestSkill('test-skill');
    const projectRoot = path.join(tmp.home, 'my-project');
    await fs.ensureDir(projectRoot);

    const { deployToProject } = await import('../../src/deploy/engine.js');
    const { getLinkRecords, resetStateCache } = await import('../../src/core/state.js');
    resetStateCache();

    await deployToProject('test-skill', 'cc', projectRoot);
    await deployToProject('test-skill', 'cc', projectRoot);

    const records = await getLinkRecords('test-skill', { scope: 'project', projectRoot });
    expect(records).toHaveLength(1);
  });

  it('user and project scope coexist for same slug+tool', async () => {
    await createTestSkill('test-skill');

    const projectRoot = path.join(tmp.home, 'my-project');
    await fs.ensureDir(projectRoot);

    // Create user-scope skill dir
    const ccSkillsDir = path.join(tmp.home, '.claude', 'skills');
    await fs.ensureDir(ccSkillsDir);

    const { deploy, deployToProject } = await import('../../src/deploy/engine.js');
    const { getLinkRecords, resetStateCache } = await import('../../src/core/state.js');
    resetStateCache();

    await deploy('test-skill', 'cc', 'skill');
    await deployToProject('test-skill', 'cc', projectRoot);

    const all = await getLinkRecords('test-skill');
    expect(all).toHaveLength(2);

    const userRecords = await getLinkRecords('test-skill', { scope: 'user' });
    expect(userRecords).toHaveLength(1);

    const projectRecords = await getLinkRecords('test-skill', { scope: 'project', projectRoot });
    expect(projectRecords).toHaveLength(1);
  });

  it('creates project dirs on first deploy', async () => {
    await createTestSkill('test-skill');

    // Don't create .claude/skills — it should be created on demand
    const projectRoot = path.join(tmp.home, 'fresh-project');
    await fs.ensureDir(projectRoot);

    const { deployToProject } = await import('../../src/deploy/engine.js');
    const { resetStateCache } = await import('../../src/core/state.js');
    resetStateCache();

    const result = await deployToProject('test-skill', 'cc', projectRoot);
    expect(result.action).toBe('deployed');

    const linkPath = path.join(projectRoot, '.claude', 'skills', 'test-skill');
    expect(await fs.pathExists(linkPath)).toBe(true);
  });
});

describe('undeployProject', () => {
  it('removes symlink and state record', async () => {
    await createTestSkill('test-skill');
    const projectRoot = path.join(tmp.home, 'my-project');
    await fs.ensureDir(projectRoot);

    const { deployToProject, undeployProject } = await import('../../src/deploy/engine.js');
    const { getLinkRecords, resetStateCache } = await import('../../src/core/state.js');
    resetStateCache();

    await deployToProject('test-skill', 'cc', projectRoot);
    const result = await undeployProject('test-skill', 'cc', projectRoot);
    expect(result.action).toBe('undeployed');
    expect(result.scope).toBe('project');

    const linkPath = path.join(projectRoot, '.claude', 'skills', 'test-skill');
    expect(await fs.pathExists(linkPath)).toBe(false);

    const records = await getLinkRecords('test-skill', { scope: 'project', projectRoot });
    expect(records).toHaveLength(0);
  });

  it('undeploying project scope does not affect user scope', async () => {
    await createTestSkill('test-skill');
    const projectRoot = path.join(tmp.home, 'my-project');
    await fs.ensureDir(projectRoot);
    const ccSkillsDir = path.join(tmp.home, '.claude', 'skills');
    await fs.ensureDir(ccSkillsDir);

    const { deploy, deployToProject, undeployProject } = await import('../../src/deploy/engine.js');
    const { getLinkRecords, resetStateCache } = await import('../../src/core/state.js');
    resetStateCache();

    await deploy('test-skill', 'cc', 'skill');
    await deployToProject('test-skill', 'cc', projectRoot);
    await undeployProject('test-skill', 'cc', projectRoot);

    const userRecords = await getLinkRecords('test-skill', { scope: 'user' });
    expect(userRecords).toHaveLength(1);

    const projectRecords = await getLinkRecords('test-skill', { scope: 'project', projectRoot });
    expect(projectRecords).toHaveLength(0);
  });

  it('skips if not deployed', async () => {
    await createTestSkill('test-skill');
    const projectRoot = path.join(tmp.home, 'my-project');
    await fs.ensureDir(projectRoot);

    const { undeployProject } = await import('../../src/deploy/engine.js');
    const { resetStateCache } = await import('../../src/core/state.js');
    resetStateCache();

    const result = await undeployProject('test-skill', 'cc', projectRoot);
    expect(result.action).toBe('skipped');
  });
});

describe('DeployResult includes scope', () => {
  it('user-scope deploy returns scope: user', async () => {
    await createTestSkill('test-skill');
    const ccSkillsDir = path.join(tmp.home, '.claude', 'skills');
    await fs.ensureDir(ccSkillsDir);

    const { deploy } = await import('../../src/deploy/engine.js');
    const { resetStateCache } = await import('../../src/core/state.js');
    resetStateCache();

    const result = await deploy('test-skill', 'cc', 'skill');
    expect(result.scope).toBe('user');
    expect(result.projectRoot).toBeUndefined();
  });

  it('user-scope undeploy returns scope: user', async () => {
    await createTestSkill('test-skill');
    const ccSkillsDir = path.join(tmp.home, '.claude', 'skills');
    await fs.ensureDir(ccSkillsDir);

    const { deploy, undeploy } = await import('../../src/deploy/engine.js');
    const { resetStateCache } = await import('../../src/core/state.js');
    resetStateCache();

    await deploy('test-skill', 'cc', 'skill');
    const result = await undeploy('test-skill', 'cc', 'skill');
    expect(result.scope).toBe('user');
  });

  it('skipped deploy returns scope: user', async () => {
    await createTestSkill('test-skill');

    const { deploy } = await import('../../src/deploy/engine.js');
    const { resetStateCache } = await import('../../src/core/state.js');
    resetStateCache();

    const result = await deploy('test-skill', 'cc', 'none');
    expect(result.scope).toBe('user');
    expect(result.action).toBe('skipped');
  });
});
