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

describe('backupCommand', () => {
  it('creates a backup', async () => {
    await createTestSkill('backup-test', { name: 'Backup Test', description: 'Will be backed up' });

    const { backupCommand } = await import('../../../src/commands/backup.js');
    await backupCommand();

    const joined = output.join('\n');
    expect(joined).toContain('Backup created');
  });
});

describe('backupListCommand', () => {
  it('shows empty message when no backups exist', async () => {
    const { backupListCommand } = await import('../../../src/commands/backup.js');
    await backupListCommand();

    expect(output.some((l) => l.includes('No backups found'))).toBe(true);
  });

  it('lists existing backups', async () => {
    await createTestSkill('list-backup', { name: 'List Backup', description: 'For listing' });

    const { backupCommand, backupListCommand } = await import('../../../src/commands/backup.js');
    await backupCommand();

    output = [];
    await backupListCommand();

    const joined = output.join('\n');
    expect(joined).toContain('Backups (1)');
  });
});
