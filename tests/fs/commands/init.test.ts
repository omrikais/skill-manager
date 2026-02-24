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
  projectDir = path.join(os.tmpdir(), `sm-init-test-${Date.now()}`);
  await fs.ensureDir(projectDir);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.remove(projectDir);
  await tmp.cleanup();
});

describe('initCommand', () => {
  it('creates a manifest file', async () => {
    const origCwd = process.cwd;
    process.cwd = () => projectDir;

    try {
      const { initCommand } = await import('../../../src/commands/init.js');
      await initCommand({});

      const manifestPath = path.join(projectDir, '.skills.json');
      expect(await fs.pathExists(manifestPath)).toBe(true);

      const manifest = await fs.readJson(manifestPath);
      expect(manifest.version).toBe(1);
      expect(Array.isArray(manifest.skills)).toBe(true);

      expect(output.some((l) => l.includes('Created'))).toBe(true);
    } finally {
      process.cwd = origCwd;
    }
  });

  it('reports already exists when manifest exists', async () => {
    const manifestPath = path.join(projectDir, '.skills.json');
    await fs.writeJson(manifestPath, { version: 1, skills: [] });

    const origCwd = process.cwd;
    process.cwd = () => projectDir;

    try {
      const { initCommand } = await import('../../../src/commands/init.js');
      await initCommand({});

      expect(output.some((l) => l.includes('already exists'))).toBe(true);
    } finally {
      process.cwd = origCwd;
    }
  });

  it('populates from current deployments with --from-current', async () => {
    await createTestSkill('deployed-skill', { name: 'Deployed', description: 'Is deployed' });

    const { deploy } = await import('../../../src/deploy/engine.js');
    const { resetStateCache } = await import('../../../src/core/state.js');
    resetStateCache();
    await deploy('deployed-skill', 'cc');

    const origCwd = process.cwd;
    process.cwd = () => projectDir;

    try {
      const { initCommand } = await import('../../../src/commands/init.js');
      await initCommand({ fromCurrent: true });

      const manifestPath = path.join(projectDir, '.skills.json');
      const manifest = await fs.readJson(manifestPath);
      expect(manifest.skills.length).toBeGreaterThan(0);
      expect(manifest.skills.some((s: { name: string }) => s.name === 'deployed-skill')).toBe(true);

      expect(output.some((l) => l.includes('skills added'))).toBe(true);
    } finally {
      process.cwd = origCwd;
    }
  });
});
