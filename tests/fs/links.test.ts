import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { createTmpSmHome, type TmpSmHome } from '../helpers/tmpdir.js';

let tmp: TmpSmHome;

beforeEach(async () => {
  tmp = await createTmpSmHome();
});

afterEach(async () => {
  await tmp.cleanup();
});

describe('createLink', () => {
  it('creates a symlink', async () => {
    const { createLink, isSymlink } = await import('../../src/fs/links.js');

    const target = path.join(tmp.home, 'target');
    const linkPath = path.join(tmp.home, 'link');
    await fs.writeFile(target, 'hello');

    await createLink(target, linkPath);
    expect(await isSymlink(linkPath)).toBe(true);

    const content = await fs.readFile(linkPath, 'utf-8');
    expect(content).toBe('hello');
  });

  it('is idempotent when target is correct', async () => {
    const { createLink, safeReadlink } = await import('../../src/fs/links.js');

    const target = path.join(tmp.home, 'target');
    const linkPath = path.join(tmp.home, 'link');
    await fs.writeFile(target, 'hello');

    await createLink(target, linkPath);
    await createLink(target, linkPath); // second call is a no-op
    expect(await safeReadlink(linkPath)).toBe(target);
  });

  it('replaces a wrong symlink', async () => {
    const { createLink, safeReadlink } = await import('../../src/fs/links.js');

    const target1 = path.join(tmp.home, 'target1');
    const target2 = path.join(tmp.home, 'target2');
    const linkPath = path.join(tmp.home, 'link');
    await fs.writeFile(target1, 'v1');
    await fs.writeFile(target2, 'v2');

    await createLink(target1, linkPath);
    await createLink(target2, linkPath);
    expect(await safeReadlink(linkPath)).toBe(target2);
  });

  it('creates parent directories', async () => {
    const { createLink, isSymlink } = await import('../../src/fs/links.js');

    const target = path.join(tmp.home, 'target');
    const linkPath = path.join(tmp.home, 'deep', 'nested', 'link');
    await fs.writeFile(target, 'hello');

    await createLink(target, linkPath);
    expect(await isSymlink(linkPath)).toBe(true);
  });
});

describe('removeLink', () => {
  it('removes a symlink', async () => {
    const { createLink, removeLink, isSymlink } = await import('../../src/fs/links.js');

    const target = path.join(tmp.home, 'target');
    const linkPath = path.join(tmp.home, 'link');
    await fs.writeFile(target, 'hello');
    await createLink(target, linkPath);

    const removed = await removeLink(linkPath);
    expect(removed).toBe(true);
    expect(await isSymlink(linkPath)).toBe(false);
  });

  it('returns false for non-symlink', async () => {
    const { removeLink } = await import('../../src/fs/links.js');

    const filePath = path.join(tmp.home, 'regular');
    await fs.writeFile(filePath, 'hello');

    const removed = await removeLink(filePath);
    expect(removed).toBe(false);
    // File should still exist
    expect(await fs.pathExists(filePath)).toBe(true);
  });

  it('returns false for nonexistent path', async () => {
    const { removeLink } = await import('../../src/fs/links.js');
    const removed = await removeLink(path.join(tmp.home, 'nope'));
    expect(removed).toBe(false);
  });
});

describe('isSymlink', () => {
  it('returns true for symlinks', async () => {
    const { isSymlink } = await import('../../src/fs/links.js');

    const target = path.join(tmp.home, 'target');
    const linkPath = path.join(tmp.home, 'link');
    await fs.writeFile(target, 'hello');
    await fs.symlink(target, linkPath);

    expect(await isSymlink(linkPath)).toBe(true);
  });

  it('returns false for regular files', async () => {
    const { isSymlink } = await import('../../src/fs/links.js');

    const filePath = path.join(tmp.home, 'regular');
    await fs.writeFile(filePath, 'hello');
    expect(await isSymlink(filePath)).toBe(false);
  });

  it('returns false for nonexistent paths', async () => {
    const { isSymlink } = await import('../../src/fs/links.js');
    expect(await isSymlink(path.join(tmp.home, 'nope'))).toBe(false);
  });
});

describe('validateLink', () => {
  it('reports healthy for correct symlink', async () => {
    const { createLink, validateLink } = await import('../../src/fs/links.js');

    const target = path.join(tmp.home, 'target');
    const linkPath = path.join(tmp.home, 'link');
    await fs.writeFile(target, 'hello');
    await createLink(target, linkPath);

    const status = await validateLink(linkPath, target);
    expect(status.health).toBe('healthy');
  });

  it('reports missing when symlink does not exist', async () => {
    const { validateLink } = await import('../../src/fs/links.js');

    const status = await validateLink(
      path.join(tmp.home, 'nope'),
      path.join(tmp.home, 'target'),
    );
    expect(status.health).toBe('missing');
  });

  it('reports conflict when non-symlink file exists', async () => {
    const { validateLink } = await import('../../src/fs/links.js');

    const filePath = path.join(tmp.home, 'file');
    await fs.writeFile(filePath, 'hello');

    const status = await validateLink(filePath, path.join(tmp.home, 'target'));
    expect(status.health).toBe('conflict');
  });

  it('reports stale when symlink points to wrong target', async () => {
    const { validateLink } = await import('../../src/fs/links.js');

    const target1 = path.join(tmp.home, 'target1');
    const target2 = path.join(tmp.home, 'target2');
    const linkPath = path.join(tmp.home, 'link');
    await fs.writeFile(target1, 'v1');
    await fs.writeFile(target2, 'v2');
    await fs.symlink(target1, linkPath);

    const status = await validateLink(linkPath, target2);
    expect(status.health).toBe('stale');
  });

  it('reports broken when target does not exist', async () => {
    const { validateLink } = await import('../../src/fs/links.js');

    const linkPath = path.join(tmp.home, 'link');
    const target = path.join(tmp.home, 'gone');
    await fs.symlink(target, linkPath);

    const status = await validateLink(linkPath, target);
    expect(status.health).toBe('broken');
  });
});

describe('repairLink', () => {
  it('repairs a missing symlink', async () => {
    const { repairLink } = await import('../../src/fs/links.js');

    const target = path.join(tmp.home, 'target');
    const linkPath = path.join(tmp.home, 'link');
    await fs.writeFile(target, 'hello');

    const result = await repairLink(linkPath, target);
    expect(result.health).toBe('healthy');
  });

  it('does not overwrite a conflict', async () => {
    const { repairLink } = await import('../../src/fs/links.js');

    const filePath = path.join(tmp.home, 'file');
    const target = path.join(tmp.home, 'target');
    await fs.writeFile(filePath, 'real file');
    await fs.writeFile(target, 'target');

    const result = await repairLink(filePath, target);
    expect(result.health).toBe('conflict');
  });
});
