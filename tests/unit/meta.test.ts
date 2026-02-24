import { describe, it, expect } from 'vitest';
import { MetaSchema, createMeta } from '../../src/core/meta.js';

describe('MetaSchema — source.originalPath', () => {
  const baseSource = { type: 'created' as const };

  it('accepts source without originalPath key', () => {
    const result = MetaSchema.safeParse({
      source: baseSource,
      deployAs: { cc: 'skill', codex: 'skill' },
    });
    expect(result.success).toBe(true);
  });

  it('accepts source with originalPath: undefined', () => {
    const result = MetaSchema.safeParse({
      source: { ...baseSource, originalPath: undefined },
      deployAs: { cc: 'skill', codex: 'skill' },
    });
    expect(result.success).toBe(true);
  });

  it('accepts source with originalPath: null', () => {
    const result = MetaSchema.safeParse({
      source: { ...baseSource, originalPath: null },
      deployAs: { cc: 'skill', codex: 'skill' },
    });
    expect(result.success).toBe(true);
  });

  it('accepts source with originalPath as a string', () => {
    const result = MetaSchema.safeParse({
      source: { ...baseSource, originalPath: '/some/path/SKILL.md' },
      deployAs: { cc: 'skill', codex: 'skill' },
    });
    expect(result.success).toBe(true);
  });
});

describe('createMeta — created source without originalPath', () => {
  it('succeeds with source type "created" and no originalPath', () => {
    const meta = createMeta({
      source: { type: 'created' },
      deployAs: { cc: 'skill', codex: 'skill' },
    });
    expect(meta.source.type).toBe('created');
    expect(meta.source.originalPath).toBeUndefined();
  });
});
