import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { createTmpSmHome, type TmpSmHome } from '../../helpers/tmpdir.js';
import { createTestSkill } from '../../helpers/skill-factory.js';

let tmp: TmpSmHome;
let output: string[];
let projectDir: string;

beforeEach(async () => {
  tmp = await createTmpSmHome();
  vi.resetModules();
  output = [];
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    output.push(args.map(String).join(' '));
  });
  projectDir = path.join(os.tmpdir(), `sm-suggest-test-${Date.now()}`);
  await fs.ensureDir(projectDir);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.remove(projectDir);
  await tmp.cleanup();
});

describe('suggestCommand', () => {
  it('shows no-suggestion message when no triggers match', async () => {
    await createTestSkill('no-trigger', { name: 'No Trigger', description: 'No triggers defined' });

    // Create project with unrelated files
    await fs.writeFile(path.join(projectDir, 'foo.txt'), 'hello', 'utf-8');

    // Mock process.cwd to point to project
    const origCwd = process.cwd;
    process.cwd = () => projectDir;

    try {
      const { suggestCommand } = await import('../../../src/commands/suggest.js');
      await suggestCommand({});

      const joined = output.join('\n');
      expect(
        joined.includes('No skill suggestions') || joined.includes('No project files')
      ).toBe(true);
    } finally {
      process.cwd = origCwd;
    }
  });

  it('suggests skills matching file triggers', async () => {
    await createTestSkill('rust-helper', {
      name: 'Rust Helper',
      description: 'Helps with Rust',
      triggers: { files: ['Cargo.toml'] },
    });

    // Create project with matching file
    await fs.writeFile(path.join(projectDir, 'Cargo.toml'), '[package]\nname = "test"', 'utf-8');

    const origCwd = process.cwd;
    process.cwd = () => projectDir;

    try {
      const { suggestCommand } = await import('../../../src/commands/suggest.js');
      await suggestCommand({});

      const joined = output.join('\n');
      expect(joined).toContain('Rust Helper');
      expect(joined).toContain('Cargo.toml');
    } finally {
      process.cwd = origCwd;
    }
  });

  it('outputs JSON with --json flag', async () => {
    await createTestSkill('json-suggest', {
      name: 'JSON Suggest',
      description: 'Suggestion test',
      triggers: { files: ['package.json'] },
    });

    await fs.writeFile(path.join(projectDir, 'package.json'), '{}', 'utf-8');

    const origCwd = process.cwd;
    process.cwd = () => projectDir;

    try {
      const { suggestCommand } = await import('../../../src/commands/suggest.js');
      await suggestCommand({ json: true });

      const jsonLine = output.find((l) => l.startsWith('['));
      expect(jsonLine).toBeDefined();
      const parsed = JSON.parse(jsonLine!);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBeGreaterThan(0);
      expect(parsed[0].slug).toBe('json-suggest');
    } finally {
      process.cwd = origCwd;
    }
  });
});
