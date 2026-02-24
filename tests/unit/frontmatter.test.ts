import { describe, it, expect } from 'vitest';
import { parseSkillContent, serializeSkillContent } from '../../src/core/frontmatter.js';

describe('parseSkillContent', () => {
  it('parses valid frontmatter', () => {
    const raw = `---
name: My Skill
description: A test skill
tags:
  - test
  - example
---
Body content here.`;

    const result = parseSkillContent(raw);
    expect(result.frontmatter.name).toBe('My Skill');
    expect(result.frontmatter.description).toBe('A test skill');
    expect(result.frontmatter.tags).toEqual(['test', 'example']);
    expect(result.content).toBe('Body content here.');
  });

  it('parses content with no frontmatter', () => {
    const raw = 'Just plain markdown content.';
    const result = parseSkillContent(raw);
    expect(result.frontmatter.name).toBeUndefined();
    expect(result.frontmatter.tags).toEqual([]);
    expect(result.content).toBe('Just plain markdown content.');
  });

  it('passes through unknown fields', () => {
    const raw = `---
name: Test
custom_field: hello
another: 42
---
Body`;

    const result = parseSkillContent(raw);
    expect(result.frontmatter.name).toBe('Test');
    expect((result.frontmatter as Record<string, unknown>).custom_field).toBe('hello');
    expect((result.frontmatter as Record<string, unknown>).another).toBe(42);
  });

  it('round-trips through serialize and parse', () => {
    const raw = `---
name: Round Trip
description: Test round trip
tags:
  - alpha
---
Body content.`;

    const parsed = parseSkillContent(raw);
    const serialized = serializeSkillContent(parsed.frontmatter, parsed.content);
    const reparsed = parseSkillContent(serialized);

    expect(reparsed.frontmatter.name).toBe('Round Trip');
    expect(reparsed.frontmatter.description).toBe('Test round trip');
    expect(reparsed.frontmatter.tags).toEqual(['alpha']);
    expect(reparsed.content).toBe('Body content.');
  });

  it('throws ZodError on invalid tags type', () => {
    const raw = `---
name: Bad Tags
tags: not-an-array
---
Body`;

    expect(() => parseSkillContent(raw)).toThrow();
  });

  it('handles empty tags array', () => {
    const raw = `---
name: No Tags
tags: []
---
Body`;

    const result = parseSkillContent(raw);
    expect(result.frontmatter.tags).toEqual([]);
  });

  it('preserves raw content', () => {
    const raw = `---
name: Test
---
Body here.`;

    const result = parseSkillContent(raw);
    expect(result.raw).toBe(raw);
  });
});
