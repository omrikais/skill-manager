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

describe('listCommand', () => {
  it('shows empty message when no skills exist', async () => {
    const { listCommand } = await import('../../../src/commands/list.js');
    await listCommand({});
    expect(output.some((l) => l.includes('No skills found'))).toBe(true);
  });

  it('lists skills with table output', async () => {
    await createTestSkill('alpha', { name: 'Alpha', description: 'First skill', tags: ['util'] });
    await createTestSkill('beta', { name: 'Beta', description: 'Second skill', tags: ['dev'] });

    const { listCommand } = await import('../../../src/commands/list.js');
    await listCommand({});

    const joined = output.join('\n');
    expect(joined).toContain('alpha');
    expect(joined).toContain('beta');
    expect(joined).toContain('Skills (2)');
  });

  it('filters by --cc when deployed to cc', async () => {
    await createTestSkill('deployed-cc', { name: 'CC Skill', description: 'Deployed to CC' });
    await createTestSkill('not-deployed', { name: 'Not Deployed', description: 'No links' });

    const { deploy } = await import('../../../src/deploy/engine.js');
    const { resetStateCache } = await import('../../../src/core/state.js');
    resetStateCache();
    await deploy('deployed-cc', 'cc');

    const { listCommand } = await import('../../../src/commands/list.js');
    await listCommand({ cc: true });

    const joined = output.join('\n');
    expect(joined).toContain('deployed-cc');
    expect(joined).not.toContain('not-deployed');
  });

  it('filters by --codex when deployed to codex', async () => {
    await createTestSkill('deployed-codex', { name: 'Codex Skill', description: 'Deployed to Codex' });
    await createTestSkill('not-deployed', { name: 'Not Deployed', description: 'No links' });

    const { deploy } = await import('../../../src/deploy/engine.js');
    const { resetStateCache } = await import('../../../src/core/state.js');
    resetStateCache();
    await deploy('deployed-codex', 'codex');

    const { listCommand } = await import('../../../src/commands/list.js');
    await listCommand({ codex: true });

    const joined = output.join('\n');
    expect(joined).toContain('deployed-codex');
    expect(joined).not.toContain('not-deployed');
  });

  it('shows format and tags columns with --status', async () => {
    await createTestSkill('status-test', { name: 'Status Test', description: 'Test', tags: ['foo', 'bar'] });

    const { listCommand } = await import('../../../src/commands/list.js');
    await listCommand({ status: true });

    const joined = output.join('\n');
    expect(joined).toContain('Format');
    expect(joined).toContain('Tags');
  });
});
