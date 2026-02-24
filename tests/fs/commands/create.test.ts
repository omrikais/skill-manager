import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs-extra';
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

describe('createCommand', () => {
  it('creates a new skill with SKILL.md and meta', async () => {
    const { createCommand } = await import('../../../src/commands/create.js');
    const { skillFile, skillMetaFile } = await import('../../../src/fs/paths.js');

    await createCommand('My New Skill', {});

    const slug = 'my-new-skill';
    expect(await fs.pathExists(skillFile(slug))).toBe(true);
    expect(await fs.pathExists(skillMetaFile(slug))).toBe(true);

    const content = await fs.readFile(skillFile(slug), 'utf-8');
    expect(content).toContain('My New Skill');

    const meta = await fs.readJson(skillMetaFile(slug));
    expect(meta.source.type).toBe('created');
    expect(meta.deployAs.cc).toBe('skill');
    expect(meta.deployAs.codex).toBe('skill');

    expect(output.some((l) => l.includes('Created skill'))).toBe(true);
  });

  it('throws SkillExistsError for duplicate skill', async () => {
    await createTestSkill('existing', { name: 'Existing', description: 'Already here' });

    const { createCommand } = await import('../../../src/commands/create.js');
    const { SkillExistsError } = await import('../../../src/utils/errors.js');

    await expect(createCommand('existing', {})).rejects.toThrow(SkillExistsError);
  });

  it('slugifies the name correctly', async () => {
    const { createCommand } = await import('../../../src/commands/create.js');
    const { skillFile } = await import('../../../src/fs/paths.js');

    await createCommand('Complex Skill Name!', {});

    expect(await fs.pathExists(skillFile('complex-skill-name'))).toBe(true);
  });
});
