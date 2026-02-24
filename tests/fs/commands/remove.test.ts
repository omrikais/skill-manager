import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs-extra';
import { createTmpSmHome, type TmpSmHome } from '../../helpers/tmpdir.js';
import { createTestSkill } from '../../helpers/skill-factory.js';

let tmp: TmpSmHome;
let output: string[];

beforeEach(async () => {
  tmp = await createTmpSmHome();
  vi.resetModules();
  output = [];
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    output.push(args.map(String).join(' '));
  });
});

afterEach(async () => {
  vi.restoreAllMocks();
  await tmp.cleanup();
});

describe('removeCommand', () => {
  it('removes from both tools by default', async () => {
    await createTestSkill('removable', { name: 'Removable', description: 'Can be removed' });

    const { deploy } = await import('../../../src/deploy/engine.js');
    const { resetStateCache } = await import('../../../src/core/state.js');
    resetStateCache();
    await deploy('removable', 'cc');
    await deploy('removable', 'codex');

    const { removeCommand } = await import('../../../src/commands/remove.js');
    await removeCommand('removable', {});

    const joined = output.join('\n');
    expect(joined).toContain('Removed removable from cc');
    expect(joined).toContain('Removed removable from codex');
  });

  it('removes from single tool when specified', async () => {
    await createTestSkill('single-remove', { name: 'Single Remove', description: 'Test' });

    const { deploy } = await import('../../../src/deploy/engine.js');
    const { resetStateCache } = await import('../../../src/core/state.js');
    resetStateCache();
    await deploy('single-remove', 'cc');
    await deploy('single-remove', 'codex');

    const { removeCommand } = await import('../../../src/commands/remove.js');
    await removeCommand('single-remove', { cc: true });

    const joined = output.join('\n');
    expect(joined).toContain('Removed single-remove from cc');
    expect(joined).not.toContain('Removed single-remove from codex');
  });

  it('purges skill entirely', async () => {
    await createTestSkill('purgeable', { name: 'Purgeable', description: 'Will be purged' });

    const { skillDir } = await import('../../../src/fs/paths.js');
    expect(await fs.pathExists(skillDir('purgeable'))).toBe(true);

    const { removeCommand } = await import('../../../src/commands/remove.js');
    await removeCommand('purgeable', { purge: true });

    expect(await fs.pathExists(skillDir('purgeable'))).toBe(false);
    expect(output.some((l) => l.includes('Purged'))).toBe(true);
  });

  it('throws SkillNotFoundError for nonexistent skill', async () => {
    const { removeCommand } = await import('../../../src/commands/remove.js');
    const { SkillNotFoundError } = await import('../../../src/utils/errors.js');

    await expect(removeCommand('nonexistent', {})).rejects.toThrow(SkillNotFoundError);
  });

  it('blocks removal when skill has deployed dependents', async () => {
    await createTestSkill('base-skill', { name: 'Base', description: 'Required by others' });
    await createTestSkill('dependent', {
      name: 'Dependent',
      description: 'Depends on base',
      depends: ['base-skill'],
    });

    const { deploy } = await import('../../../src/deploy/engine.js');
    const { resetStateCache } = await import('../../../src/core/state.js');
    resetStateCache();
    await deploy('base-skill', 'cc');
    await deploy('dependent', 'cc');

    const { removeCommand } = await import('../../../src/commands/remove.js');
    const { SmError } = await import('../../../src/utils/errors.js');

    await expect(removeCommand('base-skill', {})).rejects.toThrow(SmError);
  });

  it('allows removal with --force even with dependents', async () => {
    await createTestSkill('base-force', { name: 'Base Force', description: 'Required' });
    await createTestSkill('dep-force', {
      name: 'Dep Force',
      description: 'Depends on base',
      depends: ['base-force'],
    });

    const { deploy } = await import('../../../src/deploy/engine.js');
    const { resetStateCache } = await import('../../../src/core/state.js');
    resetStateCache();
    await deploy('base-force', 'cc');
    await deploy('dep-force', 'cc');

    const { removeCommand } = await import('../../../src/commands/remove.js');
    await removeCommand('base-force', { force: true });

    const joined = output.join('\n');
    expect(joined).toContain('Removed base-force from cc');
  });
});
