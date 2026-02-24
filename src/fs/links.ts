import fs from 'fs-extra';
import path from 'path';
import { LinkError } from '../utils/errors.js';

export type LinkHealth = 'healthy' | 'broken' | 'missing' | 'stale' | 'conflict';

export interface LinkStatus {
  linkPath: string;
  expectedTarget: string;
  actualTarget: string | null;
  health: LinkHealth;
  detail?: string;
}

/**
 * Create a symlink atomically using temp-then-rename.
 * Works for both file and directory targets.
 */
export async function createLink(target: string, linkPath: string): Promise<void> {
  await fs.ensureDir(path.dirname(linkPath));

  // If something already exists at linkPath, check if it's already correct
  if ((await fs.pathExists(linkPath)) || (await isSymlink(linkPath))) {
    const existing = await safeReadlink(linkPath);
    if (existing === target) return; // Already correct

    // Remove existing (could be file, dir, or broken link)
    await fs.remove(linkPath);
  }

  // Atomic: create in temp location, then rename
  const tempLink = linkPath + `.sm-tmp-${process.pid}`;
  try {
    await fs.symlink(target, tempLink);
    await fs.rename(tempLink, linkPath);
  } catch (err) {
    // Cleanup temp if rename failed
    await fs.remove(tempLink).catch(() => {});

    // On Windows, symlinks require Developer Mode or admin privileges.
    // For directories, fall back to junctions (no elevated privileges needed).
    if (isWindowsPermError(err)) {
      const targetIsDir = await fs
        .stat(target)
        .then((s) => s.isDirectory())
        .catch(() => false);
      if (targetIsDir) {
        try {
          await fs.symlink(target, tempLink, 'junction');
          await fs.rename(tempLink, linkPath);
          return;
        } catch (junctionErr) {
          await fs.remove(tempLink).catch(() => {});
          throw new LinkError(`Failed to create junction: ${linkPath} -> ${target}: ${junctionErr}`);
        }
      }
      throw new LinkError(
        `Permission denied creating symlink: ${linkPath} -> ${target}\n` +
          `On Windows, symlinks require Developer Mode or administrator privileges.\n` +
          `Enable Developer Mode: Settings → Update & Security → For Developers → Developer Mode`,
      );
    }

    throw new LinkError(`Failed to create symlink: ${linkPath} -> ${target}: ${err}`);
  }
}

/**
 * Remove a symlink. Only removes if it IS a symlink (won't delete real files/dirs).
 */
export async function removeLink(linkPath: string): Promise<boolean> {
  if (await isSymlink(linkPath)) {
    await fs.unlink(linkPath);
    return true;
  }
  return false;
}

/**
 * Validate a symlink's health.
 */
export async function validateLink(linkPath: string, expectedTarget: string): Promise<LinkStatus> {
  const status: LinkStatus = {
    linkPath,
    expectedTarget,
    actualTarget: null,
    health: 'healthy',
  };

  // Check if the link itself exists
  const linkExists = await isSymlink(linkPath);
  if (!linkExists) {
    // Check if a non-symlink exists at the path
    if (await fs.pathExists(linkPath)) {
      status.health = 'conflict';
      status.detail = 'Non-symlink file exists at link path';
    } else {
      status.health = 'missing';
      status.detail = 'Symlink does not exist';
    }
    return status;
  }

  // Read where it points
  status.actualTarget = await safeReadlink(linkPath);

  // Check if target is correct
  if (status.actualTarget !== expectedTarget) {
    status.health = 'stale';
    status.detail = `Points to ${status.actualTarget} instead of ${expectedTarget}`;
    return status;
  }

  // Check if the target actually exists
  if (!(await fs.pathExists(linkPath))) {
    status.health = 'broken';
    status.detail = 'Target does not exist';
    return status;
  }

  return status;
}

/**
 * Repair a broken or stale symlink.
 */
export async function repairLink(linkPath: string, expectedTarget: string): Promise<LinkStatus> {
  const status = await validateLink(linkPath, expectedTarget);

  if (status.health === 'healthy') return status;

  if (status.health === 'conflict') {
    // Non-symlink exists — don't overwrite, report
    return status;
  }

  // For missing, broken, or stale — recreate
  if (await isSymlink(linkPath)) {
    await fs.unlink(linkPath);
  }

  if (await fs.pathExists(expectedTarget)) {
    await createLink(expectedTarget, linkPath);
    return { ...status, health: 'healthy', actualTarget: expectedTarget, detail: 'Repaired' };
  }

  return { ...status, health: 'broken', detail: 'Target does not exist; cannot repair' };
}

/**
 * Check if a path is a symbolic link (works even if target is missing).
 */
export async function isSymlink(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.lstat(filePath);
    return stat.isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * Safely read a symlink target. Returns null if not a symlink.
 */
export async function safeReadlink(filePath: string): Promise<string | null> {
  try {
    return await fs.readlink(filePath);
  } catch {
    return null;
  }
}

/**
 * Check if an error is a Windows symlink permission error (EPERM/ENOTSUP).
 */
function isWindowsPermError(err: unknown): boolean {
  if (process.platform !== 'win32') return false;
  const code = (err as NodeJS.ErrnoException)?.code;
  return code === 'EPERM' || code === 'ENOTSUP';
}
