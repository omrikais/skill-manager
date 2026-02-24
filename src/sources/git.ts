import simpleGit from 'simple-git';
import fs from 'fs-extra';
import path from 'path';
import { SM_SOURCES_DIR } from '../fs/paths.js';
import { deriveSourceName } from '../core/sources.js';
import { SourceError } from '../utils/errors.js';
import { log } from '../utils/logger.js';

/**
 * Detect whether an error is caused by the `git` binary not being found.
 * Node's child_process.spawn sets code to ENOENT when the binary doesn't exist;
 * simple-git may wrap this with the code on the error or embedded in the message.
 */
function isGitNotFoundError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const e = err as NodeJS.ErrnoException;
  if (e.code === 'ENOENT') return true;
  if (/\bENOENT\b/.test(err.message) && /\bgit\b/i.test(err.message)) return true;
  return false;
}

function throwIfGitMissing(err: unknown): never {
  if (isGitNotFoundError(err)) {
    throw new SourceError(
      'Git is not installed or not in PATH. Install git from https://git-scm.com and try again.',
    );
  }
  throw err;
}

/**
 * Normalize a git remote URL for comparison.
 * Strips trailing slashes and .git suffix so that
 * "https://github.com/org/repo.git" and "https://github.com/org/repo/" match.
 */
export function normalizeRemoteUrl(url: string): string {
  return url.replace(/\/+$/, '').replace(/\.git$/, '');
}

/**
 * Check whether an existing clone's origin remote matches the expected URL.
 * If it doesn't (stale clone from a different repo), remove it so a fresh
 * clone can take its place.
 */
async function ensureCorrectRemote(repoDir: string, repoUrl: string): Promise<boolean> {
  try {
    const git = simpleGit(repoDir);
    const remotes = await git.getRemotes(true);
    const origin = remotes.find((r) => r.name === 'origin');
    if (origin && normalizeRemoteUrl(origin.refs.fetch) !== normalizeRemoteUrl(repoUrl)) {
      log.info(`Stale clone detected (origin: ${origin.refs.fetch}), re-cloning...`);
      await fs.remove(repoDir);
      return false; // directory removed, needs fresh clone
    }
  } catch {
    // If we can't read remotes (corrupt repo, not a git dir, etc.), remove and re-clone
    log.info(`Invalid clone at ${repoDir}, re-cloning...`);
    await fs.remove(repoDir);
    return false;
  }
  return true; // remote matches, safe to pull
}

/**
 * Clone or update a git repository as a skill source.
 */
export async function cloneOrPull(repoUrl: string): Promise<string> {
  await fs.ensureDir(SM_SOURCES_DIR);

  const repoName = deriveSourceName(repoUrl);
  const repoDir = path.join(SM_SOURCES_DIR, repoName);

  let exists = await fs.pathExists(repoDir);
  if (exists) {
    exists = await ensureCorrectRemote(repoDir, repoUrl);
  }

  try {
    if (exists) {
      log.info(`Updating ${repoName}...`);
      const git = simpleGit(repoDir);
      await git.pull();
    } else {
      log.info(`Cloning ${repoUrl}...`);
      const git = simpleGit();
      await git.clone(repoUrl, repoDir);
    }
  } catch (err) {
    throwIfGitMissing(err);
  }

  return repoDir;
}

/**
 * Clone or update a git repository, returning status info.
 */
export async function cloneOrPullWithStatus(repoUrl: string): Promise<{ dir: string; wasExisting: boolean }> {
  await fs.ensureDir(SM_SOURCES_DIR);

  const repoName = deriveSourceName(repoUrl);
  const repoDir = path.join(SM_SOURCES_DIR, repoName);
  let wasExisting = await fs.pathExists(repoDir);

  if (wasExisting) {
    const remoteOk = await ensureCorrectRemote(repoDir, repoUrl);
    if (!remoteOk) {
      wasExisting = false; // stale clone removed, treat as fresh
    }
  }

  try {
    if (wasExisting) {
      log.info(`Updating ${repoName}...`);
      const git = simpleGit(repoDir);
      await git.pull();
    } else {
      log.info(`Cloning ${repoUrl}...`);
      const git = simpleGit();
      await git.clone(repoUrl, repoDir);
    }
  } catch (err) {
    throwIfGitMissing(err);
  }

  return { dir: repoDir, wasExisting };
}

/**
 * List cloned source repos.
 */
export async function listSources(): Promise<string[]> {
  await fs.ensureDir(SM_SOURCES_DIR);
  const entries = await fs.readdir(SM_SOURCES_DIR, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}
