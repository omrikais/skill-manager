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

describe('profileCommand', () => {
  it('lists empty when no profiles exist', async () => {
    const { profileCommand } = await import('../../../src/commands/profile.js');
    await profileCommand('list');

    expect(output.some((l) => l.includes('No profiles found'))).toBe(true);
  });

  it('creates a profile from current skills', async () => {
    await createTestSkill('profile-skill', { name: 'Profile Skill', description: 'For profile' });

    const { profileCommand } = await import('../../../src/commands/profile.js');
    await profileCommand('create', 'my-profile');

    const joined = output.join('\n');
    expect(joined).toContain('Created profile');
    expect(joined).toContain('my-profile');
  });

  it('lists profiles after creation', async () => {
    await createTestSkill('listed', { name: 'Listed', description: 'In profile' });

    const { profileCommand } = await import('../../../src/commands/profile.js');
    await profileCommand('create', 'test-profile');

    output = [];
    await profileCommand('list');

    const joined = output.join('\n');
    expect(joined).toContain('test-profile');
    expect(joined).toContain('1 skills');
  });

  it('deletes a profile', async () => {
    await createTestSkill('del-profile', { name: 'Del Profile', description: 'To delete' });

    const { profileCommand } = await import('../../../src/commands/profile.js');
    await profileCommand('create', 'deletable');

    output = [];
    await profileCommand('delete', 'deletable');

    expect(output.some((l) => l.includes('Deleted profile'))).toBe(true);
  });

  it('throws UsageError when name is missing for create', async () => {
    const { profileCommand } = await import('../../../src/commands/profile.js');
    const { UsageError } = await import('../../../src/utils/errors.js');

    await expect(profileCommand('create')).rejects.toThrow(UsageError);
  });
});
