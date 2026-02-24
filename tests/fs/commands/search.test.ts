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

describe('searchCommand', () => {
  it('shows no-match message when nothing found', async () => {
    await createTestSkill('alpha', { name: 'Alpha', description: 'First skill' });

    const { searchCommand } = await import('../../../src/commands/search.js');
    await searchCommand('zzz-nonexistent');

    expect(output.some((l) => l.includes('No skills matching'))).toBe(true);
  });

  it('matches by slug', async () => {
    await createTestSkill('rust-helper', { name: 'Rust Helper', description: 'Helps with Rust' });

    const { searchCommand } = await import('../../../src/commands/search.js');
    await searchCommand('rust');

    const joined = output.join('\n');
    expect(joined).toContain('rust-helper');
    expect(joined).toContain('Found 1 skill(s)');
  });

  it('matches by name (case-insensitive)', async () => {
    await createTestSkill('my-skill', { name: 'JavaScript Helper', description: 'JS stuff' });

    const { searchCommand } = await import('../../../src/commands/search.js');
    await searchCommand('javascript');

    const joined = output.join('\n');
    expect(joined).toContain('my-skill');
  });

  it('matches by tag', async () => {
    await createTestSkill('tagged', { name: 'Tagged', description: 'Has tags', tags: ['python', 'ml'] });

    const { searchCommand } = await import('../../../src/commands/search.js');
    await searchCommand('python');

    const joined = output.join('\n');
    expect(joined).toContain('tagged');
  });

  it('matches by content', async () => {
    await createTestSkill('content-match', { name: 'Content Match', description: 'Some desc' });

    const { searchCommand } = await import('../../../src/commands/search.js');
    // The content includes "# content-match" from the factory
    await searchCommand('content-match');

    const joined = output.join('\n');
    expect(joined).toContain('content-match');
  });

  it('finds multiple matches', async () => {
    await createTestSkill('react-hooks', { name: 'React Hooks', description: 'React hooks guide' });
    await createTestSkill('react-state', { name: 'React State', description: 'React state mgmt' });
    await createTestSkill('vue-basics', { name: 'Vue Basics', description: 'Vue.js' });

    const { searchCommand } = await import('../../../src/commands/search.js');
    await searchCommand('react');

    const joined = output.join('\n');
    expect(joined).toContain('Found 2 skill(s)');
    expect(joined).toContain('react-hooks');
    expect(joined).toContain('react-state');
    expect(joined).not.toContain('vue-basics');
  });
});
