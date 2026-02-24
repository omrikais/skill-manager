import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { createTmpSmHome, type TmpSmHome } from '../../helpers/tmpdir.js';

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

describe('importCommand', () => {
  it('reports dry run without making changes', async () => {
    // Create a CC commands dir with a test skill
    const { CC_COMMANDS_DIR } = await import('../../../src/fs/paths.js');
    await fs.ensureDir(CC_COMMANDS_DIR);
    await fs.writeFile(
      `${CC_COMMANDS_DIR}/test-import.md`,
      '---\nname: "Test Import"\ndescription: "A test"\ntags: []\n---\n\n# Test Import\n',
      'utf-8',
    );

    const { importCommand } = await import('../../../src/commands/import.js');
    await importCommand({ dryRun: true });

    const joined = output.join('\n');
    expect(joined).toContain('dry-run');
    expect(joined).toContain('No changes made');
  });

  it('imports skills from CC commands directory', async () => {
    const { CC_COMMANDS_DIR, SM_SKILLS_DIR } = await import('../../../src/fs/paths.js');
    await fs.ensureDir(CC_COMMANDS_DIR);
    await fs.writeFile(
      `${CC_COMMANDS_DIR}/import-me.md`,
      '---\nname: "Import Me"\ndescription: "To import"\ntags: []\n---\n\n# Import Me\n',
      'utf-8',
    );

    const { importCommand } = await import('../../../src/commands/import.js');
    await importCommand({});

    const joined = output.join('\n');
    expect(joined).toContain('Import complete');
    expect(await fs.pathExists(`${SM_SKILLS_DIR}/import-me/SKILL.md`)).toBe(true);
  });

  it('reports no files found from empty directories', async () => {
    const { importCommand } = await import('../../../src/commands/import.js');
    await importCommand({});

    const joined = output.join('\n');
    expect(joined).toContain('No skills found to import');
  });
});

describe('importCommand — path-based single skill', () => {
  it('imports a skill from a local directory', async () => {
    const { SM_SKILLS_DIR } = await import('../../../src/fs/paths.js');
    const { importCommand } = await import('../../../src/commands/import.js');

    // Create a skill directory with SKILL.md
    const skillSrcDir = path.join(tmp.home, 'my-skill');
    await fs.ensureDir(skillSrcDir);
    await fs.writeFile(
      path.join(skillSrcDir, 'SKILL.md'),
      '---\nname: "My Skill"\ndescription: "Test skill"\ntags: [test]\n---\n\n# My Skill\n\nContent here.\n',
      'utf-8',
    );

    await importCommand({ path: skillSrcDir });

    // Verify skill was imported into canonical store
    expect(await fs.pathExists(path.join(SM_SKILLS_DIR, 'my-skill', 'SKILL.md'))).toBe(true);

    // Verify meta was created with source type 'created'
    const meta = await fs.readJson(path.join(SM_SKILLS_DIR, 'my-skill', '.sm-meta.json'));
    expect(meta.source.type).toBe('created');
    expect(meta.source.originalPath).toBe(path.join(skillSrcDir, 'SKILL.md'));

    const joined = output.join('\n');
    expect(joined).toContain('Imported skill: my-skill');
  });

  it('derives slug from directory name when frontmatter has no name', async () => {
    const { SM_SKILLS_DIR } = await import('../../../src/fs/paths.js');
    const { importCommand } = await import('../../../src/commands/import.js');

    const skillSrcDir = path.join(tmp.home, 'cool-tool');
    await fs.ensureDir(skillSrcDir);
    await fs.writeFile(path.join(skillSrcDir, 'SKILL.md'), '# Cool Tool\n\nNo frontmatter here.\n', 'utf-8');

    await importCommand({ path: skillSrcDir });

    expect(await fs.pathExists(path.join(SM_SKILLS_DIR, 'cool-tool', 'SKILL.md'))).toBe(true);
  });

  it('copies companion files (references/) into canonical store', async () => {
    const { SM_SKILLS_DIR } = await import('../../../src/fs/paths.js');
    const { importCommand } = await import('../../../src/commands/import.js');

    const skillSrcDir = path.join(tmp.home, 'ref-skill');
    await fs.ensureDir(path.join(skillSrcDir, 'references'));
    await fs.writeFile(path.join(skillSrcDir, 'SKILL.md'), '---\nname: "Ref Skill"\n---\n\n# Ref Skill\n', 'utf-8');
    await fs.writeFile(path.join(skillSrcDir, 'references', 'api.md'), 'API docs');

    await importCommand({ path: skillSrcDir });

    expect(await fs.pathExists(path.join(SM_SKILLS_DIR, 'ref-skill', 'references', 'api.md'))).toBe(true);
  });

  it('throws UsageError when directory has no SKILL.md', async () => {
    const { importCommand } = await import('../../../src/commands/import.js');
    const { UsageError } = await import('../../../src/utils/errors.js');

    const emptyDir = path.join(tmp.home, 'empty-dir');
    await fs.ensureDir(emptyDir);

    await expect(importCommand({ path: emptyDir })).rejects.toThrow(UsageError);
  });

  it('throws SkillExistsError when skill already exists', async () => {
    const { SM_SKILLS_DIR } = await import('../../../src/fs/paths.js');
    const { importCommand } = await import('../../../src/commands/import.js');
    const { SkillExistsError } = await import('../../../src/utils/errors.js');

    // Pre-create the skill in canonical store
    await fs.ensureDir(path.join(SM_SKILLS_DIR, 'dupe-skill'));
    await fs.writeFile(
      path.join(SM_SKILLS_DIR, 'dupe-skill', 'SKILL.md'),
      '---\nname: "Dupe Skill"\n---\n\n# Existing\n',
      'utf-8',
    );

    // Try to import a skill with the same slug
    const skillSrcDir = path.join(tmp.home, 'dupe-skill');
    await fs.ensureDir(skillSrcDir);
    await fs.writeFile(path.join(skillSrcDir, 'SKILL.md'), '---\nname: "Dupe Skill"\n---\n\n# Duplicate\n', 'utf-8');

    await expect(importCommand({ path: skillSrcDir })).rejects.toThrow(SkillExistsError);
  });

  it('respects --dry-run and makes no changes', async () => {
    const { SM_SKILLS_DIR } = await import('../../../src/fs/paths.js');
    const { importCommand } = await import('../../../src/commands/import.js');

    const skillSrcDir = path.join(tmp.home, 'dry-run-skill');
    await fs.ensureDir(skillSrcDir);
    await fs.writeFile(path.join(skillSrcDir, 'SKILL.md'), '---\nname: "Dry Run Skill"\n---\n\n# Dry Run\n', 'utf-8');

    await importCommand({ path: skillSrcDir, dryRun: true });

    // Skill should NOT exist in canonical store
    expect(await fs.pathExists(path.join(SM_SKILLS_DIR, 'dry-run-skill'))).toBe(false);

    const joined = output.join('\n');
    expect(joined).toContain('dry-run-skill');
    expect(joined).toContain('No changes made');
  });
});
