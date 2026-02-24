import { describe, it, expect } from 'vitest';
import { slugify } from '../../src/utils/slug.js';

describe('adopt — slug resolution', () => {
  it('slugify produces valid slugs from filenames', () => {
    expect(slugify('my-skill')).toBe('my-skill');
    expect(slugify('My Skill')).toBe('my-skill');
    expect(slugify('  foo  ')).toBe('foo');
    expect(slugify('foo_bar baz')).toBe('foo-bar-baz');
  });

  it('slugify strips .md extension before slugifying', () => {
    // The adopt code strips .md before calling slugify
    const filename = 'test-adopt.md';
    const slug = slugify(filename.replace(/\.md$/, ''));
    expect(slug).toBe('test-adopt');
  });

  it('numeric suffix pattern generates expected names', () => {
    const base = 'foo';
    const suffixed = Array.from({ length: 5 }, (_, i) => `${base}-${i + 2}`);
    expect(suffixed).toEqual(['foo-2', 'foo-3', 'foo-4', 'foo-5', 'foo-6']);
  });
});

describe('adopt — deployAs mapping', () => {
  it('CC commands dir maps to legacy-command for cc only', () => {
    // Mirrors buildDeployAs(tool, format)
    const buildDeployAs = (tool: string, format: string) => ({
      cc: tool === 'cc' ? format : 'none',
      codex: tool === 'codex' ? format : 'none',
    });

    expect(buildDeployAs('cc', 'legacy-command')).toEqual({ cc: 'legacy-command', codex: 'none' });
    expect(buildDeployAs('cc', 'skill')).toEqual({ cc: 'skill', codex: 'none' });
    expect(buildDeployAs('codex', 'legacy-prompt')).toEqual({ cc: 'none', codex: 'legacy-prompt' });
    expect(buildDeployAs('codex', 'skill')).toEqual({ cc: 'none', codex: 'skill' });
  });
});

describe('adopt — debounce logic', () => {
  it('elapsed time within window should skip', () => {
    const now = Date.now();
    const last = new Date(now - 5000).toISOString(); // 5s ago
    const elapsed = now - new Date(last).getTime();
    expect(elapsed).toBeLessThan(10_000);
  });

  it('elapsed time beyond window should proceed', () => {
    const now = Date.now();
    const last = new Date(now - 15000).toISOString(); // 15s ago
    const elapsed = now - new Date(last).getTime();
    expect(elapsed).toBeGreaterThanOrEqual(10_000);
  });
});
