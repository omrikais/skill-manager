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

describe('importSingleSkill — directory copy scope', () => {
  it('copies companion directories for directory skills (SKILL.md)', async () => {
    const { importSingleSkill } = await import('../../src/commands/_import-helpers.js');
    const { SM_SKILLS_DIR } = await import('../../src/fs/paths.js');

    // Simulate a cloned repo with a skill directory that has references/
    const repoDir = path.join(tmp.home, 'repo');
    const skillSrcDir = path.join(repoDir, 'my-skill');
    await fs.ensureDir(path.join(skillSrcDir, 'references'));
    await fs.writeFile(path.join(skillSrcDir, 'SKILL.md'), '---\nname: my-skill\n---\n# content');
    await fs.writeFile(path.join(skillSrcDir, 'references', 'api.md'), 'API docs');

    await importSingleSkill({
      slug: 'my-skill',
      content: '---\nname: my-skill\n---\n# content',
      source: { type: 'git', repo: 'https://github.com/org/repo', originalPath: path.join(skillSrcDir, 'SKILL.md') },
    });

    const destDir = path.join(SM_SKILLS_DIR, 'my-skill');
    expect(await fs.pathExists(path.join(destDir, 'references', 'api.md'))).toBe(true);
  });

  it('copies companion files (not just directories) for directory skills', async () => {
    const { importSingleSkill } = await import('../../src/commands/_import-helpers.js');
    const { SM_SKILLS_DIR } = await import('../../src/fs/paths.js');

    const repoDir = path.join(tmp.home, 'repo');
    const skillSrcDir = path.join(repoDir, 'my-skill');
    await fs.ensureDir(skillSrcDir);
    await fs.writeFile(path.join(skillSrcDir, 'SKILL.md'), '---\nname: my-skill\n---\n# content');
    await fs.writeFile(path.join(skillSrcDir, 'setup.sh'), '#!/bin/bash\necho hello');
    await fs.writeFile(path.join(skillSrcDir, 'config.yaml'), 'key: value');

    await importSingleSkill({
      slug: 'my-skill',
      content: '---\nname: my-skill\n---\n# content',
      source: { type: 'git', repo: 'https://github.com/org/repo', originalPath: path.join(skillSrcDir, 'SKILL.md') },
    });

    const destDir = path.join(SM_SKILLS_DIR, 'my-skill');
    expect(await fs.pathExists(path.join(destDir, 'setup.sh'))).toBe(true);
    expect(await fs.pathExists(path.join(destDir, 'config.yaml'))).toBe(true);
  });

  it('copies companion files when slug differs from directory name (generic dir)', async () => {
    const { importSingleSkill } = await import('../../src/commands/_import-helpers.js');
    const { SM_SKILLS_DIR } = await import('../../src/fs/paths.js');

    // Simulate a generic "skill/" directory where slug was derived from frontmatter
    const repoDir = path.join(tmp.home, 'repo');
    const skillSrcDir = path.join(repoDir, 'skill');
    await fs.ensureDir(path.join(skillSrcDir, 'references'));
    await fs.ensureDir(path.join(skillSrcDir, 'assets'));
    await fs.writeFile(path.join(skillSrcDir, 'SKILL.md'), '---\nname: Textual TUI\n---\n# content');
    await fs.writeFile(path.join(skillSrcDir, 'references', 'api.md'), 'API docs');
    await fs.writeFile(path.join(skillSrcDir, 'assets', 'logo.png'), 'fake-png');

    await importSingleSkill({
      slug: 'textual-tui',
      content: '---\nname: Textual TUI\n---\n# content',
      source: { type: 'git', repo: 'https://github.com/org/repo', originalPath: path.join(skillSrcDir, 'SKILL.md') },
    });

    const destDir = path.join(SM_SKILLS_DIR, 'textual-tui');
    expect(await fs.pathExists(path.join(destDir, 'SKILL.md'))).toBe(true);
    expect(await fs.pathExists(path.join(destDir, 'references', 'api.md'))).toBe(true);
    expect(await fs.pathExists(path.join(destDir, 'assets', 'logo.png'))).toBe(true);
  });

  it('skips repo infrastructure but preserves companion files at repo root', async () => {
    const { importSingleSkill } = await import('../../src/commands/_import-helpers.js');
    const { SM_SKILLS_DIR } = await import('../../src/fs/paths.js');

    // Simulate a single-skill repo with SKILL.md at the root
    const repoDir = path.join(tmp.home, 'repo');
    await fs.ensureDir(path.join(repoDir, '.git'));
    await fs.ensureDir(path.join(repoDir, '.github'));
    await fs.ensureDir(path.join(repoDir, 'node_modules', 'some-pkg'));
    await fs.ensureDir(path.join(repoDir, 'references'));
    await fs.writeFile(path.join(repoDir, 'SKILL.md'), '---\nname: solo-skill\n---\n# content');
    await fs.writeFile(path.join(repoDir, 'references', 'api.md'), 'API docs');
    await fs.writeFile(path.join(repoDir, 'README.md'), '# Repo readme');

    await importSingleSkill({
      slug: 'solo-skill',
      content: '---\nname: solo-skill\n---\n# content',
      source: { type: 'git', repo: 'https://github.com/org/repo', originalPath: path.join(repoDir, 'SKILL.md') },
    });

    const destDir = path.join(SM_SKILLS_DIR, 'solo-skill');
    expect(await fs.pathExists(path.join(destDir, 'SKILL.md'))).toBe(true);
    // Companion content is preserved
    expect(await fs.pathExists(path.join(destDir, 'references', 'api.md'))).toBe(true);
    // Repo infrastructure is skipped
    expect(await fs.pathExists(path.join(destDir, '.git'))).toBe(false);
    expect(await fs.pathExists(path.join(destDir, '.github'))).toBe(false);
    expect(await fs.pathExists(path.join(destDir, 'node_modules'))).toBe(false);
  });

  it('does NOT copy repo-root directories for standalone .md skills', async () => {
    const { importSingleSkill } = await import('../../src/commands/_import-helpers.js');
    const { SM_SKILLS_DIR } = await import('../../src/fs/paths.js');

    // Simulate a cloned repo with a standalone .md skill and sibling directories
    const repoDir = path.join(tmp.home, 'repo');
    await fs.ensureDir(path.join(repoDir, 'other-skill'));
    await fs.ensureDir(path.join(repoDir, 'unrelated-dir'));
    await fs.writeFile(path.join(repoDir, 'standalone.md'), '---\nname: standalone\n---\n# content');
    await fs.writeFile(path.join(repoDir, 'other-skill', 'SKILL.md'), 'other skill');
    await fs.writeFile(path.join(repoDir, 'unrelated-dir', 'data.txt'), 'data');

    await importSingleSkill({
      slug: 'standalone',
      content: '---\nname: standalone\n---\n# content',
      source: { type: 'git', repo: 'https://github.com/org/repo', originalPath: path.join(repoDir, 'standalone.md') },
    });

    const destDir = path.join(SM_SKILLS_DIR, 'standalone');
    // SKILL.md should exist
    expect(await fs.pathExists(path.join(destDir, 'SKILL.md'))).toBe(true);
    // Sibling directories from repo root should NOT have been copied
    expect(await fs.pathExists(path.join(destDir, 'other-skill'))).toBe(false);
    expect(await fs.pathExists(path.join(destDir, 'unrelated-dir'))).toBe(false);
  });
});
