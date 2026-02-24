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

describe('doctorCommand', () => {
  it('passes all checks on clean state with skills', async () => {
    await createTestSkill('healthy', { name: 'Healthy', description: 'All good' }, {
      lastDeployed: new Date().toISOString(),
      lastUsed: new Date().toISOString(),
    });

    const { doctorCommand } = await import('../../../src/commands/doctor.js');
    await doctorCommand();

    const joined = output.join('\n');
    expect(joined).toContain('Skill manager home exists');
    expect(joined).toContain('1 skills');
    expect(joined).toContain('All checks passed');
  });

  it('detects broken symlinks', async () => {
    await createTestSkill('broken-link', { name: 'Broken Link', description: 'Will break' });

    const { deploy } = await import('../../../src/deploy/engine.js');
    const { resetStateCache, getLinkRecords } = await import('../../../src/core/state.js');
    resetStateCache();
    await deploy('broken-link', 'cc');

    // Break the link by removing the target
    const records = await getLinkRecords('broken-link');
    for (const record of records) {
      await fs.remove(record.linkPath);
    }

    const { doctorCommand } = await import('../../../src/commands/doctor.js');
    await doctorCommand();

    const joined = output.join('\n');
    expect(joined).toContain('broken');
    expect(joined).toContain('issue(s) found');
  });

  it('detects missing dependency', async () => {
    await createTestSkill('dep-base', { name: 'Base', description: 'Base skill' });
    await createTestSkill('dep-app', {
      name: 'App',
      description: 'Depends on base',
      depends: ['dep-base'],
    });

    // Deploy app but not base — should detect missing dep on that tool
    const { deploy } = await import('../../../src/deploy/engine.js');
    const { resetStateCache } = await import('../../../src/core/state.js');
    resetStateCache();
    await deploy('dep-app', 'cc');

    const { doctorCommand } = await import('../../../src/commands/doctor.js');
    await doctorCommand();

    const joined = output.join('\n');
    expect(joined).toContain('Missing dependency');
    expect(joined).toContain('dep-base');
  });
});
