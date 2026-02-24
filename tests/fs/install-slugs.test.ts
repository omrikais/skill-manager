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
  vi.restoreAllMocks();
});

const SKILL_A_CONTENT = `---
name: Skill A
description: First skill
tags: [test]
---
# Skill A
`;

const SKILL_B_CONTENT = `---
name: Skill B
description: Second skill
tags: [test]
---
# Skill B
`;

const SKILL_C_CONTENT = `---
name: Skill C
description: Third skill
tags: [test]
---
# Skill C
`;

const SKILL_NESTED_CONTENT = `---
name: Nested Skill
description: Deeply nested skill
tags: [test]
---
# Nested Skill
`;

/**
 * Create a fake repo directory with skills.
 */
async function createFakeRepo(baseDir: string, sourceName: string): Promise<string> {
  const repoDir = path.join(baseDir, 'sources', sourceName);
  await fs.ensureDir(repoDir);

  const skillADir = path.join(repoDir, 'skill-a');
  await fs.ensureDir(skillADir);
  await fs.writeFile(path.join(skillADir, 'SKILL.md'), SKILL_A_CONTENT);

  const skillBDir = path.join(repoDir, 'skill-b');
  await fs.ensureDir(skillBDir);
  await fs.writeFile(path.join(skillBDir, 'SKILL.md'), SKILL_B_CONTENT);

  const skillCDir = path.join(repoDir, 'skill-c');
  await fs.ensureDir(skillCDir);
  await fs.writeFile(path.join(skillCDir, 'SKILL.md'), SKILL_C_CONTENT);

  // Nested skill 3 levels deep: vendor/skills/nested-skill/SKILL.md
  const nestedDir = path.join(repoDir, 'vendor', 'skills', 'nested-skill');
  await fs.ensureDir(nestedDir);
  await fs.writeFile(path.join(nestedDir, 'SKILL.md'), SKILL_NESTED_CONTENT);

  return repoDir;
}

describe('sourceAddCommand with slug filtering', () => {
  it('installs only requested slugs when filter provided', async () => {
    const url = 'https://github.com/user/test-repo.git';
    const repoDir = await createFakeRepo(tmp.smHome, 'test-repo');

    vi.doMock('../../src/sources/git.js', () => ({
      cloneOrPull: async () => repoDir,
      cloneOrPullWithStatus: async () => ({ dir: repoDir, cloned: true }),
    }));

    const { sourceAddCommand } = await import('../../src/commands/source.js');
    const { SM_SKILLS_DIR } = await import('../../src/fs/paths.js');

    await sourceAddCommand(url, { install: true, slugs: ['skill-a'] });

    expect(await fs.pathExists(path.join(SM_SKILLS_DIR, 'skill-a', 'SKILL.md'))).toBe(true);
    expect(await fs.pathExists(path.join(SM_SKILLS_DIR, 'skill-b', 'SKILL.md'))).toBe(false);
    expect(await fs.pathExists(path.join(SM_SKILLS_DIR, 'skill-c', 'SKILL.md'))).toBe(false);
  });

  it('installs all skills when no slug filter', async () => {
    const url = 'https://github.com/user/test-repo.git';
    const repoDir = await createFakeRepo(tmp.smHome, 'test-repo');

    vi.doMock('../../src/sources/git.js', () => ({
      cloneOrPull: async () => repoDir,
      cloneOrPullWithStatus: async () => ({ dir: repoDir, cloned: true }),
    }));

    const { sourceAddCommand } = await import('../../src/commands/source.js');
    const { SM_SKILLS_DIR } = await import('../../src/fs/paths.js');

    await sourceAddCommand(url, { install: true });

    expect(await fs.pathExists(path.join(SM_SKILLS_DIR, 'skill-a', 'SKILL.md'))).toBe(true);
    expect(await fs.pathExists(path.join(SM_SKILLS_DIR, 'skill-b', 'SKILL.md'))).toBe(true);
    expect(await fs.pathExists(path.join(SM_SKILLS_DIR, 'skill-c', 'SKILL.md'))).toBe(true);
    expect(await fs.pathExists(path.join(SM_SKILLS_DIR, 'nested-skill', 'SKILL.md'))).toBe(true);
  });

  it('throws SourceError when slug not found in repo', async () => {
    const url = 'https://github.com/user/test-repo.git';
    const repoDir = await createFakeRepo(tmp.smHome, 'test-repo');

    vi.doMock('../../src/sources/git.js', () => ({
      cloneOrPull: async () => repoDir,
      cloneOrPullWithStatus: async () => ({ dir: repoDir, cloned: true }),
    }));

    const { sourceAddCommand } = await import('../../src/commands/source.js');
    const { SourceError } = await import('../../src/utils/errors.js');

    await expect(
      sourceAddCommand(url, { install: true, slugs: ['nonexistent'] }),
    ).rejects.toThrow(SourceError);
  });

  it('installs a nested skill by slug', async () => {
    const url = 'https://github.com/user/test-repo.git';
    const repoDir = await createFakeRepo(tmp.smHome, 'test-repo');

    vi.doMock('../../src/sources/git.js', () => ({
      cloneOrPull: async () => repoDir,
      cloneOrPullWithStatus: async () => ({ dir: repoDir, cloned: true }),
    }));

    const { sourceAddCommand } = await import('../../src/commands/source.js');
    const { SM_SKILLS_DIR } = await import('../../src/fs/paths.js');

    await sourceAddCommand(url, { install: true, slugs: ['nested-skill'] });

    expect(await fs.pathExists(path.join(SM_SKILLS_DIR, 'nested-skill', 'SKILL.md'))).toBe(true);
    expect(await fs.pathExists(path.join(SM_SKILLS_DIR, 'skill-a', 'SKILL.md'))).toBe(false);
  });

  it('installs multiple selected slugs', async () => {
    const url = 'https://github.com/user/test-repo.git';
    const repoDir = await createFakeRepo(tmp.smHome, 'test-repo');

    vi.doMock('../../src/sources/git.js', () => ({
      cloneOrPull: async () => repoDir,
      cloneOrPullWithStatus: async () => ({ dir: repoDir, cloned: true }),
    }));

    const { sourceAddCommand } = await import('../../src/commands/source.js');
    const { SM_SKILLS_DIR } = await import('../../src/fs/paths.js');

    await sourceAddCommand(url, { install: true, slugs: ['skill-a', 'skill-c'] });

    expect(await fs.pathExists(path.join(SM_SKILLS_DIR, 'skill-a', 'SKILL.md'))).toBe(true);
    expect(await fs.pathExists(path.join(SM_SKILLS_DIR, 'skill-b', 'SKILL.md'))).toBe(false);
    expect(await fs.pathExists(path.join(SM_SKILLS_DIR, 'skill-c', 'SKILL.md'))).toBe(true);
  });
});

describe('checkSkillConflict', () => {
  it('returns "new" for non-existent skill', async () => {
    const { checkSkillConflict } = await import('../../src/commands/_import-helpers.js');
    const status = await checkSkillConflict('does-not-exist', '# content');
    expect(status).toBe('new');
  });

  it('returns "identical" when content matches', async () => {
    const { SM_SKILLS_DIR } = await import('../../src/fs/paths.js');
    const { checkSkillConflict } = await import('../../src/commands/_import-helpers.js');

    // Create skill with same content
    await fs.ensureDir(path.join(SM_SKILLS_DIR, 'my-skill'));
    await fs.writeFile(path.join(SM_SKILLS_DIR, 'my-skill', 'SKILL.md'), SKILL_A_CONTENT);

    const status = await checkSkillConflict('my-skill', SKILL_A_CONTENT);
    expect(status).toBe('identical');
  });

  it('returns "changed" when content differs', async () => {
    const { SM_SKILLS_DIR } = await import('../../src/fs/paths.js');
    const { checkSkillConflict } = await import('../../src/commands/_import-helpers.js');

    await fs.ensureDir(path.join(SM_SKILLS_DIR, 'my-skill'));
    await fs.writeFile(path.join(SM_SKILLS_DIR, 'my-skill', 'SKILL.md'), '# old content');

    const status = await checkSkillConflict('my-skill', '# new content');
    expect(status).toBe('changed');
  });

  it('returns "identical" after importing content without a name field', async () => {
    const { checkSkillConflict, importSingleSkill } = await import('../../src/commands/_import-helpers.js');

    // Remote content has frontmatter but no name field
    const remoteContent = `---\ndescription: A useful skill\ntags: [test]\n---\n# Useful skill content\n`;

    // Import — importSingleSkill injects slug as name
    await importSingleSkill({
      slug: 'no-name-skill',
      content: remoteContent,
      source: { type: 'imported' },
    });

    // Conflict check with the same raw remote content should be identical
    const status = await checkSkillConflict('no-name-skill', remoteContent);
    expect(status).toBe('identical');
  });
});

describe('sourceAddCommand hash-based update behavior', () => {
  it('skips identical installed skills with "up to date" message', async () => {
    const url = 'https://github.com/user/test-repo.git';
    const repoDir = await createFakeRepo(tmp.smHome, 'test-repo');

    vi.doMock('../../src/sources/git.js', () => ({
      cloneOrPull: async () => repoDir,
      cloneOrPullWithStatus: async () => ({ dir: repoDir, cloned: true }),
    }));

    const { sourceAddCommand } = await import('../../src/commands/source.js');
    const { SM_SKILLS_DIR } = await import('../../src/fs/paths.js');

    // Pre-install with identical content
    await fs.ensureDir(path.join(SM_SKILLS_DIR, 'skill-a'));
    await fs.writeFile(path.join(SM_SKILLS_DIR, 'skill-a', 'SKILL.md'), SKILL_A_CONTENT);

    // Should succeed without error — skill is up to date
    await sourceAddCommand(url, { install: true, slugs: ['skill-a'] });

    // Content should be unchanged
    const content = await fs.readFile(path.join(SM_SKILLS_DIR, 'skill-a', 'SKILL.md'), 'utf-8');
    expect(content).toBe(SKILL_A_CONTENT);
  });

  it('skips changed skills in non-TTY mode (no prompt)', async () => {
    const url = 'https://github.com/user/test-repo.git';
    const repoDir = await createFakeRepo(tmp.smHome, 'test-repo');

    vi.doMock('../../src/sources/git.js', () => ({
      cloneOrPull: async () => repoDir,
      cloneOrPullWithStatus: async () => ({ dir: repoDir, cloned: true }),
    }));

    const { sourceAddCommand } = await import('../../src/commands/source.js');
    const { SM_SKILLS_DIR } = await import('../../src/fs/paths.js');

    // Pre-install with DIFFERENT content
    await fs.ensureDir(path.join(SM_SKILLS_DIR, 'skill-a'));
    await fs.writeFile(path.join(SM_SKILLS_DIR, 'skill-a', 'SKILL.md'), '# old version');

    // In test env, stdin is not a TTY, so confirmUpdate returns false
    await sourceAddCommand(url, { install: true, slugs: ['skill-a'] });

    // Content should NOT be overwritten (user didn't approve)
    const content = await fs.readFile(path.join(SM_SKILLS_DIR, 'skill-a', 'SKILL.md'), 'utf-8');
    expect(content).toBe('# old version');
  });

  it('overwrites changed skills with --force', async () => {
    const url = 'https://github.com/user/test-repo.git';
    const repoDir = await createFakeRepo(tmp.smHome, 'test-repo');

    vi.doMock('../../src/sources/git.js', () => ({
      cloneOrPull: async () => repoDir,
      cloneOrPullWithStatus: async () => ({ dir: repoDir, cloned: true }),
    }));

    const { sourceAddCommand } = await import('../../src/commands/source.js');
    const { SM_SKILLS_DIR } = await import('../../src/fs/paths.js');

    // Pre-install with different content
    await fs.ensureDir(path.join(SM_SKILLS_DIR, 'skill-a'));
    await fs.writeFile(path.join(SM_SKILLS_DIR, 'skill-a', 'SKILL.md'), '# old version');

    // Force update
    await sourceAddCommand(url, { install: true, slugs: ['skill-a'], force: true });

    // Content should be overwritten with the remote version
    const content = await fs.readFile(path.join(SM_SKILLS_DIR, 'skill-a', 'SKILL.md'), 'utf-8');
    expect(content).toBe(SKILL_A_CONTENT);
  });
});
