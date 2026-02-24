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

describe('loadConfig', () => {
  it('returns defaults on fresh directory', async () => {
    const { loadConfig, resetConfigCache } = await import('../../src/core/config.js');
    resetConfigCache();

    const config = await loadConfig();
    expect(config.defaultTools).toEqual(['cc', 'codex']);
    expect(config.autoSync).toBe(true);
    expect(config.logLevel).toBe('info');
  });

  it('round-trips save/load', async () => {
    const { loadConfig, saveConfig, resetConfigCache } = await import('../../src/core/config.js');
    resetConfigCache();

    const config = await loadConfig();
    config.logLevel = 'debug';
    config.autoSync = false;
    await saveConfig(config);

    resetConfigCache();
    const reloaded = await loadConfig();
    expect(reloaded.logLevel).toBe('debug');
    expect(reloaded.autoSync).toBe(false);
  });

  it('handles corrupt TOML gracefully', async () => {
    const { loadConfig, resetConfigCache } = await import('../../src/core/config.js');
    resetConfigCache();

    const configPath = path.join(tmp.smHome, 'config.toml');
    await fs.writeFile(configPath, '{{{{invalid toml!!!!', 'utf-8');

    await expect(loadConfig()).rejects.toThrow();
  });

  it('handles invalid schema values', async () => {
    const { loadConfig, resetConfigCache } = await import('../../src/core/config.js');
    resetConfigCache();

    const configPath = path.join(tmp.smHome, 'config.toml');
    await fs.writeFile(configPath, 'logLevel = "banana"', 'utf-8');

    await expect(loadConfig()).rejects.toThrow();
  });
});
