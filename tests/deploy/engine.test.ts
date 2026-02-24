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

async function createTestSkill(slug: string, deployAs?: { cc?: string; codex?: string }) {
  const skillsDir = path.join(tmp.smHome, 'skills', slug);
  await fs.ensureDir(skillsDir);
  await fs.writeFile(path.join(skillsDir, 'SKILL.md'), `---\nname: ${slug}\n---\nContent`);
  await fs.writeJson(path.join(skillsDir, '.sm-meta.json'), {
    format: 'skill',
    source: { type: 'created' },
    tags: [],
    deployAs: {
      cc: deployAs?.cc ?? 'legacy-command',
      codex: deployAs?.codex ?? 'legacy-prompt',
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

describe('deploy', () => {
  it('deploys skill format (directory symlink)', async () => {
    await createTestSkill('test-skill', { cc: 'skill', codex: 'none' });

    // Create CC skills dir
    const ccSkillsDir = path.join(tmp.home, '.claude', 'skills');
    await fs.ensureDir(ccSkillsDir);

    const { deploy } = await import('../../src/deploy/engine.js');
    const { resetStateCache } = await import('../../src/core/state.js');
    resetStateCache();

    const result = await deploy('test-skill', 'cc', 'skill');
    expect(result.action).toBe('deployed');
    expect(result.format).toBe('skill');
  });

  it('deploys legacy-command format', async () => {
    await createTestSkill('test-cmd');

    // Create CC commands dir
    const ccCommandsDir = path.join(tmp.home, '.claude', 'commands');
    await fs.ensureDir(ccCommandsDir);

    const { deploy } = await import('../../src/deploy/engine.js');
    const { resetStateCache } = await import('../../src/core/state.js');
    resetStateCache();

    const result = await deploy('test-cmd', 'cc', 'legacy-command');
    expect(result.action).toBe('deployed');
    expect(result.format).toBe('legacy-command');
    expect(result.linkPath).toMatch(/test-cmd\.md$/);
  });

  it('deploys legacy-prompt format', async () => {
    await createTestSkill('test-prompt');

    // Create Codex prompts dir
    const codexPromptsDir = path.join(tmp.home, '.codex', 'prompts');
    await fs.ensureDir(codexPromptsDir);

    const { deploy } = await import('../../src/deploy/engine.js');
    const { resetStateCache } = await import('../../src/core/state.js');
    resetStateCache();

    const result = await deploy('test-prompt', 'codex', 'legacy-prompt');
    expect(result.action).toBe('deployed');
    expect(result.format).toBe('legacy-prompt');
    expect(result.linkPath).toMatch(/test-prompt\.md$/);
  });

  it('skips format:none', async () => {
    await createTestSkill('test-none', { cc: 'none', codex: 'none' });

    const { deploy } = await import('../../src/deploy/engine.js');
    const { resetStateCache } = await import('../../src/core/state.js');
    resetStateCache();

    const result = await deploy('test-none', 'cc', 'none');
    expect(result.action).toBe('skipped');
  });

  it('records link in state', async () => {
    await createTestSkill('test-state');
    const ccCommandsDir = path.join(tmp.home, '.claude', 'commands');
    await fs.ensureDir(ccCommandsDir);

    const { deploy } = await import('../../src/deploy/engine.js');
    const { getLinkRecords, resetStateCache } = await import('../../src/core/state.js');
    resetStateCache();

    await deploy('test-state', 'cc', 'legacy-command');
    const records = await getLinkRecords('test-state');
    expect(records).toHaveLength(1);
    expect(records[0].tool).toBe('cc');
  });
});

describe('undeploy', () => {
  it('removes a deployed skill and updates state', async () => {
    await createTestSkill('test-undeploy');
    const ccCommandsDir = path.join(tmp.home, '.claude', 'commands');
    await fs.ensureDir(ccCommandsDir);

    const { deploy, undeploy } = await import('../../src/deploy/engine.js');
    const { getLinkRecords, resetStateCache } = await import('../../src/core/state.js');
    resetStateCache();

    await deploy('test-undeploy', 'cc', 'legacy-command');
    const result = await undeploy('test-undeploy', 'cc', 'legacy-command');
    expect(result.action).toBe('undeployed');

    const records = await getLinkRecords('test-undeploy');
    expect(records).toHaveLength(0);
  });
});

describe('idempotent state', () => {
  it('deploying twice does not duplicate state records', async () => {
    await createTestSkill('test-idem');
    const ccCommandsDir = path.join(tmp.home, '.claude', 'commands');
    await fs.ensureDir(ccCommandsDir);

    const { deploy } = await import('../../src/deploy/engine.js');
    const { getLinkRecords, resetStateCache } = await import('../../src/core/state.js');
    resetStateCache();

    await deploy('test-idem', 'cc', 'legacy-command');
    await deploy('test-idem', 'cc', 'legacy-command');

    const records = await getLinkRecords('test-idem');
    expect(records).toHaveLength(1);
  });
});
