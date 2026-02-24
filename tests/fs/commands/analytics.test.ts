import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTmpSmHome, type TmpSmHome } from '../../helpers/tmpdir.js';
import { createTestSkill } from '../../helpers/skill-factory.js';

let tmp: TmpSmHome;
let output: string[];
let stdoutData: string[];

beforeEach(async () => {
  tmp = await createTmpSmHome();
  vi.resetModules();
  output = [];
  stdoutData = [];
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    output.push(args.map(String).join(' '));
  });
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
    stdoutData.push(String(chunk));
    return true;
  });
});

afterEach(async () => {
  vi.restoreAllMocks();
  await tmp.cleanup();
});

describe('analyticsCommand', () => {
  it('shows empty message when no skills exist', async () => {
    const { analyticsCommand } = await import('../../../src/commands/analytics.js');
    await analyticsCommand({});

    const joined = output.join('\n');
    expect(joined).toContain('No skills found');
  });

  it('displays usage statistics table', async () => {
    await createTestSkill('active', {
      name: 'Active',
      description: 'Heavily used',
    }, {
      usageCount: 42,
      lastUsed: new Date().toISOString(),
      lastDeployed: new Date().toISOString(),
    });
    await createTestSkill('idle', {
      name: 'Idle',
      description: 'Never used',
    });

    const { analyticsCommand } = await import('../../../src/commands/analytics.js');
    await analyticsCommand({});

    const joined = output.join('\n');
    expect(joined).toContain('Skill Usage Analytics');
    expect(joined).toContain('active');
    expect(joined).toContain('idle');
  });

  it('outputs JSON with --json flag', async () => {
    await createTestSkill('json-test', {
      name: 'JSON Test',
      description: 'Test JSON output',
    }, {
      usageCount: 5,
    });

    const { analyticsCommand } = await import('../../../src/commands/analytics.js');
    await analyticsCommand({ json: true });

    const jsonStr = stdoutData.join('');
    const parsed = JSON.parse(jsonStr);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0].slug).toBe('json-test');
    expect(parsed[0].usageCount).toBe(5);
  });
});
