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

describe('historyCommand', () => {
  it('shows no-history message when no versions recorded', async () => {
    await createTestSkill('no-history', { name: 'No History', description: 'Fresh skill' });

    const { historyCommand } = await import('../../../src/commands/history.js');
    await historyCommand('no-history');

    expect(output.some((l) => l.includes('No version history'))).toBe(true);
  });

  it('displays version history', async () => {
    await createTestSkill('versioned', { name: 'Versioned', description: 'Has history' });

    // Record a version
    const { recordVersion } = await import('../../../src/core/versioning.js');
    await recordVersion('versioned', 'initial');

    const { historyCommand } = await import('../../../src/commands/history.js');
    await historyCommand('versioned');

    const joined = output.join('\n');
    expect(joined).toContain('Version history for versioned');
    expect(joined).toContain('v1');
    expect(joined).toContain('initial');
  });

  it('throws SkillNotFoundError for nonexistent skill', async () => {
    const { historyCommand } = await import('../../../src/commands/history.js');
    const { SkillNotFoundError } = await import('../../../src/utils/errors.js');

    await expect(historyCommand('nonexistent')).rejects.toThrow(SkillNotFoundError);
  });
});

describe('rollbackCommand', () => {
  it('rolls back to previous version', async () => {
    await createTestSkill('rollback-test', { name: 'Rollback Test', description: 'Will rollback' });

    const { recordVersion } = await import('../../../src/core/versioning.js');
    await recordVersion('rollback-test', 'v1');

    // Modify the skill content
    const { skillFile } = await import('../../../src/fs/paths.js');
    const fs = await import('fs-extra');
    await fs.default.writeFile(skillFile('rollback-test'), '---\nname: "Modified"\n---\n\n# Modified', 'utf-8');
    await recordVersion('rollback-test', 'v2');

    const { rollbackCommand } = await import('../../../src/commands/history.js');
    await rollbackCommand('rollback-test', '1');

    expect(output.some((l) => l.includes('Rolled back'))).toBe(true);
  });

  it('throws SkillNotFoundError for nonexistent skill', async () => {
    const { rollbackCommand } = await import('../../../src/commands/history.js');
    const { SkillNotFoundError } = await import('../../../src/utils/errors.js');

    await expect(rollbackCommand('nonexistent')).rejects.toThrow(SkillNotFoundError);
  });
});
