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

describe('createBackup', () => {
  it('creates a backup with manifest', async () => {
    const { createBackup } = await import('../../src/fs/backup.js');

    // Set up source directory
    const srcDir = path.join(tmp.home, 'src-dir');
    await fs.ensureDir(srcDir);
    await fs.writeFile(path.join(srcDir, 'test.md'), '# Test');

    const info = await createBackup([{ label: 'test', path: srcDir }]);
    expect(info.fileCount).toBe(1);
    expect(info.sources).toContain('test');
    expect(await fs.pathExists(info.path)).toBe(true);
  });

  it('handles missing source directory', async () => {
    const { createBackup } = await import('../../src/fs/backup.js');

    const info = await createBackup([{ label: 'missing', path: '/nonexistent/dir' }]);
    expect(info.fileCount).toBe(0);
  });
});

describe('listBackups', () => {
  it('lists created backups', async () => {
    const { createBackup, listBackups } = await import('../../src/fs/backup.js');

    const srcDir = path.join(tmp.home, 'src-dir');
    await fs.ensureDir(srcDir);
    await fs.writeFile(path.join(srcDir, 'test.md'), '# Test');

    await createBackup([{ label: 'test', path: srcDir }]);
    const backups = await listBackups();
    expect(backups.length).toBeGreaterThanOrEqual(1);
  });

  it('returns empty for fresh directory', async () => {
    const { listBackups } = await import('../../src/fs/backup.js');
    const backups = await listBackups();
    expect(backups).toHaveLength(0);
  });
});

describe('restoreBackup', () => {
  it('restores files from backup', async () => {
    const { createBackup, restoreBackup } = await import('../../src/fs/backup.js');

    const srcDir = path.join(tmp.home, 'src-dir');
    await fs.ensureDir(srcDir);
    await fs.writeFile(path.join(srcDir, 'test.md'), '# Test');

    const info = await createBackup([{ label: 'test', path: srcDir }]);

    const restoreDir = path.join(tmp.home, 'restore-dir');
    const result = await restoreBackup(info.id, { test: restoreDir });
    expect(result.restored).toBe(1);
    expect(result.errors).toHaveLength(0);
    expect(await fs.pathExists(path.join(restoreDir, 'test.md'))).toBe(true);
  });

  it('throws for nonexistent backup', async () => {
    const { restoreBackup } = await import('../../src/fs/backup.js');

    await expect(
      restoreBackup('nonexistent-id', { test: '/tmp/restore' }),
    ).rejects.toThrow('Backup not found');
  });
});
