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

async function createTestSkill(
  slug: string,
  opts?: { deployAs?: { cc?: string; codex?: string }; depends?: string[] }
) {
  const skillsDir = path.join(tmp.smHome, 'skills', slug);
  await fs.ensureDir(skillsDir);

  const depends = opts?.depends ?? [];
  const frontmatter = depends.length > 0
    ? `---\nname: ${slug}\ndepends: [${depends.join(', ')}]\n---\n`
    : `---\nname: ${slug}\n---\n`;

  await fs.writeFile(path.join(skillsDir, 'SKILL.md'), `${frontmatter}Content`);
  await fs.writeJson(path.join(skillsDir, '.sm-meta.json'), {
    format: 'skill',
    source: { type: 'created' },
    tags: [],
    deployAs: {
      cc: opts?.deployAs?.cc ?? 'legacy-command',
      codex: opts?.deployAs?.codex ?? 'legacy-prompt',
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

describe('addCommand — missing dependencies', () => {
  it('blocks deploy when a required dependency is missing from the store', async () => {
    // Create skill-a which depends on "nonexistent" (not in store)
    await createTestSkill('skill-a', { depends: ['nonexistent'] });

    // Create target directories
    await fs.ensureDir(path.join(tmp.home, '.claude', 'commands'));
    await fs.ensureDir(path.join(tmp.home, '.codex', 'prompts'));

    const { addCommand } = await import('../../src/commands/add.js');
    const { getLinkRecords, resetStateCache } = await import('../../src/core/state.js');
    resetStateCache();

    await expect(addCommand('skill-a', {})).rejects.toThrow('Missing dependencies');

    // skill-a should NOT be deployed to any tool
    const records = await getLinkRecords('skill-a');
    expect(records).toHaveLength(0);
  });

  it('allows deploy with --no-deps even when dependencies are missing', async () => {
    await createTestSkill('skill-b', { depends: ['nonexistent'] });

    await fs.ensureDir(path.join(tmp.home, '.claude', 'commands'));
    await fs.ensureDir(path.join(tmp.home, '.codex', 'prompts'));

    const { addCommand } = await import('../../src/commands/add.js');
    const { getLinkRecords, resetStateCache } = await import('../../src/core/state.js');
    resetStateCache();

    await addCommand('skill-b', { deps: false });

    // skill-b SHOULD be deployed since deps check was skipped
    const records = await getLinkRecords('skill-b');
    expect(records.length).toBeGreaterThan(0);
  });

  it('deploys normally when all dependencies are present', async () => {
    await createTestSkill('dep-skill');
    await createTestSkill('main-skill', { depends: ['dep-skill'] });

    await fs.ensureDir(path.join(tmp.home, '.claude', 'commands'));
    await fs.ensureDir(path.join(tmp.home, '.codex', 'prompts'));

    const { addCommand } = await import('../../src/commands/add.js');
    const { getLinkRecords, resetStateCache } = await import('../../src/core/state.js');
    resetStateCache();

    await addCommand('main-skill', {});

    // Both dep-skill and main-skill should be deployed
    const mainRecords = await getLinkRecords('main-skill');
    expect(mainRecords.length).toBeGreaterThan(0);

    const depRecords = await getLinkRecords('dep-skill');
    expect(depRecords.length).toBeGreaterThan(0);
  });
});
