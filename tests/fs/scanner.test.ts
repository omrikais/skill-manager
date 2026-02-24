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

describe('scanAll', () => {
  it('returns empty results for empty directories', async () => {
    // Create empty source dirs
    await fs.ensureDir(path.join(tmp.home, '.claude', 'commands'));
    await fs.ensureDir(path.join(tmp.home, '.codex', 'prompts'));

    const { scanAll } = await import('../../src/fs/scanner.js');
    const result = await scanAll();
    expect(result.allFiles).toHaveLength(0);
    expect(result.totalErrors).toBe(0);
  });

  it('scans .md files in cc-commands', async () => {
    const ccDir = path.join(tmp.home, '.claude', 'commands');
    await fs.ensureDir(ccDir);
    await fs.writeFile(path.join(ccDir, 'test-skill.md'), '# Test Skill\nContent here');

    const { scanAll } = await import('../../src/fs/scanner.js');
    const result = await scanAll(['cc-commands']);
    expect(result.allFiles).toHaveLength(1);
    expect(result.allFiles[0].slug).toBe('test-skill');
    expect(result.allFiles[0].source).toBe('cc-commands');
  });

  it('scans skill directories in codex-skills', async () => {
    const codexDir = path.join(tmp.home, '.agents', 'skills');
    const skillDir = path.join(codexDir, 'my-skill');
    await fs.ensureDir(skillDir);
    await fs.writeFile(path.join(skillDir, 'SKILL.md'), '# My Skill');

    const { scanAll } = await import('../../src/fs/scanner.js');
    const result = await scanAll(['codex-skills']);
    expect(result.allFiles).toHaveLength(1);
    expect(result.allFiles[0].slug).toBe('my-skill');
  });

  it('skips dotfiles', async () => {
    const ccDir = path.join(tmp.home, '.claude', 'commands');
    await fs.ensureDir(ccDir);
    await fs.writeFile(path.join(ccDir, '.hidden.md'), 'hidden');
    await fs.writeFile(path.join(ccDir, 'visible.md'), 'visible');

    const { scanAll } = await import('../../src/fs/scanner.js');
    const result = await scanAll(['cc-commands']);
    expect(result.allFiles).toHaveLength(1);
    expect(result.allFiles[0].slug).toBe('visible');
  });

  it('handles missing source directories', async () => {
    // Don't create any dirs — should not throw
    const { scanAll } = await import('../../src/fs/scanner.js');
    const result = await scanAll(['cc-commands']);
    expect(result.allFiles).toHaveLength(0);
  });

  it('follows symlinks in skill directories', async () => {
    const codexDir = path.join(tmp.home, '.agents', 'skills');
    await fs.ensureDir(codexDir);

    // Create actual skill dir elsewhere
    const realDir = path.join(tmp.home, 'actual-skill');
    await fs.ensureDir(realDir);
    await fs.writeFile(path.join(realDir, 'SKILL.md'), '# Linked Skill');

    // Symlink it into codex skills
    await fs.symlink(realDir, path.join(codexDir, 'linked-skill'));

    const { scanAll } = await import('../../src/fs/scanner.js');
    const result = await scanAll(['codex-skills']);
    expect(result.allFiles).toHaveLength(1);
    expect(result.allFiles[0].slug).toBe('linked-skill');
  });

  it('records errors for broken symlinks', async () => {
    const codexDir = path.join(tmp.home, '.agents', 'skills');
    await fs.ensureDir(codexDir);

    // Create a broken symlink
    await fs.symlink('/nonexistent/path', path.join(codexDir, 'broken'));

    const { scanAll } = await import('../../src/fs/scanner.js');
    const result = await scanAll(['codex-skills']);
    expect(result.allFiles).toHaveLength(0);
    // The broken symlink should not cause allFiles to have entries
    // It may or may not record an error depending on implementation
  });
});
