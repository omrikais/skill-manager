import fs from 'fs-extra';
import path from 'path';
import { SM_BACKUPS_DIR, backupDir } from './paths.js';
import { log } from '../utils/logger.js';

export interface BackupInfo {
  id: string;
  timestamp: string;
  path: string;
  sources: string[];
  fileCount: number;
}

/**
 * Create a timestamped backup of given directories.
 */
export async function createBackup(
  sourceDirs: Array<{ label: string; path: string }>,
): Promise<BackupInfo> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const bDir = backupDir(timestamp);
  await fs.ensureDir(bDir);

  let fileCount = 0;
  const sources: string[] = [];

  for (const { label, path: srcDir } of sourceDirs) {
    if (!(await fs.pathExists(srcDir))) continue;

    const destDir = path.join(bDir, label);
    await fs.ensureDir(destDir);

    const entries = await fs.readdir(srcDir);
    for (const entry of entries) {
      if (entry.startsWith('.')) continue;
      const srcPath = path.join(srcDir, entry);
      const destPath = path.join(destDir, entry);

      try {
        // Copy actual content (dereference symlinks)
        await fs.copy(srcPath, destPath, { dereference: true });
        fileCount++;
      } catch (err) {
        log.warn(`Failed to backup ${srcPath}: ${err}`);
      }
    }

    sources.push(label);
  }

  // Write manifest
  const info: BackupInfo = {
    id: timestamp,
    timestamp: new Date().toISOString(),
    path: bDir,
    sources,
    fileCount,
  };
  await fs.writeJson(path.join(bDir, 'manifest.json'), info, { spaces: 2 });

  return info;
}

/**
 * List all backups.
 */
export async function listBackups(): Promise<BackupInfo[]> {
  await fs.ensureDir(SM_BACKUPS_DIR);
  const entries = await fs.readdir(SM_BACKUPS_DIR, { withFileTypes: true });
  const backups: BackupInfo[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const manifestPath = path.join(SM_BACKUPS_DIR, entry.name, 'manifest.json');
    if (await fs.pathExists(manifestPath)) {
      try {
        backups.push(await fs.readJson(manifestPath));
      } catch {
        // Skip invalid backups
      }
    }
  }

  return backups.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

/**
 * Restore from a backup.
 */
export async function restoreBackup(
  backupId: string,
  targetDirs: Record<string, string>,
): Promise<{ restored: number; errors: string[] }> {
  const bDir = backupDir(backupId);
  if (!(await fs.pathExists(bDir))) {
    throw new Error(`Backup not found: ${backupId}`);
  }

  let restored = 0;
  const errors: string[] = [];

  for (const [label, targetDir] of Object.entries(targetDirs)) {
    const srcDir = path.join(bDir, label);
    if (!(await fs.pathExists(srcDir))) continue;

    await fs.ensureDir(targetDir);
    const entries = await fs.readdir(srcDir);

    for (const entry of entries) {
      if (entry === 'manifest.json') continue;
      try {
        await fs.copy(path.join(srcDir, entry), path.join(targetDir, entry), {
          overwrite: true,
        });
        restored++;
      } catch (err) {
        errors.push(`Failed to restore ${entry}: ${err}`);
      }
    }
  }

  return { restored, errors };
}
