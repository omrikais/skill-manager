import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { createTmpSmHome, type TmpSmHome } from '../helpers/tmpdir.js';

let tmp: TmpSmHome;

beforeEach(async () => {
  tmp = await createTmpSmHome();
  vi.resetModules();
});

afterEach(async () => {
  await tmp.cleanup();
});

describe('hooksSetupCommand', () => {
  it('creates settings.json with SessionStart hook', async () => {
    const { CC_HOME } = await import('../../src/fs/paths.js');
    const { hooksSetupCommand } = await import('../../src/commands/hooks.js');

    await hooksSetupCommand({});

    const settingsPath = path.join(CC_HOME, 'settings.json');
    expect(await fs.pathExists(settingsPath)).toBe(true);

    const settings = await fs.readJson(settingsPath);
    expect(settings.hooks).toBeDefined();
    expect(settings.hooks.SessionStart).toHaveLength(1);
    expect(settings.hooks.SessionStart[0].hooks[0].command).toBe('sm hooks run session-start');
    expect(settings.hooks.SessionStart[0].hooks[0].timeout).toBe(30);
  });

  it('is idempotent — does not duplicate hook entry', async () => {
    const { CC_HOME } = await import('../../src/fs/paths.js');
    const { hooksSetupCommand } = await import('../../src/commands/hooks.js');

    await hooksSetupCommand({});
    await hooksSetupCommand({});

    const settingsPath = path.join(CC_HOME, 'settings.json');
    const settings = await fs.readJson(settingsPath);
    expect(settings.hooks.SessionStart).toHaveLength(1);
  });

  it('preserves existing settings', async () => {
    const { CC_HOME } = await import('../../src/fs/paths.js');
    const { hooksSetupCommand } = await import('../../src/commands/hooks.js');

    const settingsPath = path.join(CC_HOME, 'settings.json');
    await fs.ensureDir(path.dirname(settingsPath));
    await fs.writeJson(settingsPath, { permissions: { allow: ['Read'] } });

    await hooksSetupCommand({});

    const settings = await fs.readJson(settingsPath);
    expect(settings.permissions).toEqual({ allow: ['Read'] });
    expect(settings.hooks.SessionStart).toHaveLength(1);
  });

  it('writes to project settings with --project flag', async () => {
    const { hooksSetupCommand } = await import('../../src/commands/hooks.js');

    const projectDir = path.join(os.tmpdir(), `sm-hook-setup-proj-${Date.now()}`);
    await fs.ensureDir(projectDir);

    const origCwd = process.cwd();
    process.chdir(projectDir);

    try {
      await hooksSetupCommand({ project: true });

      const settingsPath = path.join(projectDir, '.claude', 'settings.local.json');
      expect(await fs.pathExists(settingsPath)).toBe(true);

      const settings = await fs.readJson(settingsPath);
      expect(settings.hooks.SessionStart).toHaveLength(1);
    } finally {
      process.chdir(origCwd);
      await fs.remove(projectDir);
    }
  });
});
