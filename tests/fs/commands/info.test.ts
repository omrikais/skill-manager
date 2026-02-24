import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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

describe('infoCommand', () => {
  it('displays full skill info', async () => {
    await createTestSkill('test-skill', {
      name: 'Test Skill',
      description: 'A test skill for info',
      tags: ['test', 'example'],
    });

    const { infoCommand } = await import('../../../src/commands/info.js');
    await infoCommand('test-skill');

    const joined = output.join('\n');
    expect(joined).toContain('Test Skill');
    expect(joined).toContain('test-skill');
    expect(joined).toContain('Metadata');
    expect(joined).toContain('test, example');
    expect(joined).toContain('Deployment');
    expect(joined).toContain('skill');
  });

  it('displays dependency info when deps exist', async () => {
    await createTestSkill('lib-skill', { name: 'Lib', description: 'A library' });
    await createTestSkill('app-skill', {
      name: 'App',
      description: 'App with deps',
      depends: ['lib-skill'],
    });

    const { infoCommand } = await import('../../../src/commands/info.js');
    await infoCommand('app-skill');

    const joined = output.join('\n');
    expect(joined).toContain('Dependencies');
    expect(joined).toContain('lib-skill');
  });

  it('shows active links when deployed', async () => {
    await createTestSkill('deployed', { name: 'Deployed', description: 'Has links' });

    const { deploy } = await import('../../../src/deploy/engine.js');
    const { resetStateCache } = await import('../../../src/core/state.js');
    resetStateCache();
    await deploy('deployed', 'cc');

    const { infoCommand } = await import('../../../src/commands/info.js');
    await infoCommand('deployed');

    const joined = output.join('\n');
    expect(joined).toContain('Active Links');
    expect(joined).toContain('cc');
  });

  it('throws SkillNotFoundError for nonexistent skill', async () => {
    const { infoCommand } = await import('../../../src/commands/info.js');
    const { SkillNotFoundError } = await import('../../../src/utils/errors.js');

    await expect(infoCommand('nonexistent')).rejects.toThrow(SkillNotFoundError);
  });
});
