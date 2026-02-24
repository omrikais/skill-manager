import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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

describe('convertCommand', () => {
  it('converts a legacy-command skill to skill format', async () => {
    await createTestSkill('legacy', { name: 'Legacy', description: 'Old format' }, {
      deployAs: { cc: 'legacy-command', codex: 'legacy-prompt' },
    });

    // Manually set format to legacy-command in meta
    const { skillMetaFile } = await import('../../../src/fs/paths.js');
    const fs = await import('fs-extra');
    const meta = await fs.default.readJson(skillMetaFile('legacy'));
    meta.format = 'legacy-command';
    await fs.default.writeJson(skillMetaFile('legacy'), meta);

    const { convertCommand } = await import('../../../src/commands/convert.js');
    await convertCommand('legacy');

    const updatedMeta = await fs.default.readJson(skillMetaFile('legacy'));
    expect(updatedMeta.format).toBe('skill');
    expect(updatedMeta.deployAs.cc).toBe('skill');
    expect(updatedMeta.deployAs.codex).toBe('skill');
    expect(output.some((l) => l.includes('Converted'))).toBe(true);
  });

  it('shows message when already in skill format', async () => {
    await createTestSkill('modern', { name: 'Modern', description: 'Already skill' });

    const { convertCommand } = await import('../../../src/commands/convert.js');
    await convertCommand('modern');

    expect(output.some((l) => l.includes('already in skill format'))).toBe(true);
  });

  it('throws SkillNotFoundError for nonexistent skill', async () => {
    const { convertCommand } = await import('../../../src/commands/convert.js');
    const { SkillNotFoundError } = await import('../../../src/utils/errors.js');

    await expect(convertCommand('nonexistent')).rejects.toThrow(SkillNotFoundError);
  });
});
