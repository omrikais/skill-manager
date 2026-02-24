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

describe('syncCommand', () => {
  it('shows message when no links deployed', async () => {
    const { syncCommand } = await import('../../../src/commands/sync.js');
    await syncCommand({});

    expect(output.some((l) => l.includes('No deployed skills found'))).toBe(true);
  });

  it('reports all healthy when links are valid', async () => {
    await createTestSkill('sync-ok', { name: 'Sync OK', description: 'Will be healthy' });

    const { deploy } = await import('../../../src/deploy/engine.js');
    const { resetStateCache } = await import('../../../src/core/state.js');
    resetStateCache();
    await deploy('sync-ok', 'cc');

    const { syncCommand } = await import('../../../src/commands/sync.js');
    await syncCommand({});

    const joined = output.join('\n');
    expect(joined).toContain('Healthy:');
    expect(joined).toContain('All symlinks healthy');
  });

  it('detects broken link and reports', async () => {
    await createTestSkill('sync-broken', { name: 'Sync Broken', description: 'Will break' });

    const { deploy } = await import('../../../src/deploy/engine.js');
    const { resetStateCache, getLinkRecords } = await import('../../../src/core/state.js');
    resetStateCache();
    await deploy('sync-broken', 'cc');

    // Break the symlink target
    const records = await getLinkRecords('sync-broken');
    for (const record of records) {
      await fs.remove(record.linkPath);
      // Create a broken symlink
      await fs.symlink('/nonexistent/path', record.linkPath);
    }

    const { syncCommand } = await import('../../../src/commands/sync.js');
    await syncCommand({});

    const joined = output.join('\n');
    expect(joined).toContain('Broken:');
  });

  it('repairs broken links with --repair', async () => {
    await createTestSkill('sync-repair', { name: 'Sync Repair', description: 'Will be repaired' });

    const { deploy } = await import('../../../src/deploy/engine.js');
    const { resetStateCache, getLinkRecords } = await import('../../../src/core/state.js');
    resetStateCache();
    await deploy('sync-repair', 'cc');

    // Break the symlink
    const records = await getLinkRecords('sync-repair');
    for (const record of records) {
      await fs.remove(record.linkPath);
    }

    const { syncCommand } = await import('../../../src/commands/sync.js');
    await syncCommand({ repair: true });

    const joined = output.join('\n');
    expect(joined).toContain('Repairing');
    expect(joined).toContain('Repaired');
  });
});
