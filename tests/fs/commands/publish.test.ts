import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { createTmpSmHome, type TmpSmHome } from '../../helpers/tmpdir.js';
import { createTestSkill } from '../../helpers/skill-factory.js';

let tmp: TmpSmHome;
let output: string[];
let outDir: string;

beforeEach(async () => {
  tmp = await createTmpSmHome();
  vi.resetModules();
  output = [];
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    output.push(args.map(String).join(' '));
  });
  outDir = path.join(os.tmpdir(), `sm-publish-test-${Date.now()}`);
  await fs.ensureDir(outDir);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.remove(outDir);
  await tmp.cleanup();
});

describe('publishCommand', () => {
  it('publishes skill to output directory', async () => {
    await createTestSkill('publishable', { name: 'Publishable', description: 'Can be published' });

    const { publishCommand } = await import('../../../src/commands/publish.js');
    await publishCommand('publishable', { out: outDir });

    const publishedDir = path.join(outDir, 'publishable');
    expect(await fs.pathExists(path.join(publishedDir, 'SKILL.md'))).toBe(true);

    const joined = output.join('\n');
    expect(joined).toContain('Published');
    expect(joined).toContain('SKILL.md');
  });

  it('throws for nonexistent skill', async () => {
    const { publishCommand } = await import('../../../src/commands/publish.js');

    await expect(publishCommand('nonexistent', { out: outDir })).rejects.toThrow();
  });
});
