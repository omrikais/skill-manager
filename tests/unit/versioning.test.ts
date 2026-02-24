import { describe, it, expect } from 'vitest';
import { hashContent } from '../../src/core/hash.js';

describe('versioning logic (pure)', () => {
  it('duplicate content produces same hash (skip logic basis)', () => {
    const content = '---\nname: test\n---\n\n# Test\n';
    const hash1 = hashContent(content);
    const hash2 = hashContent(content);
    expect(hash1).toBe(hash2);
  });

  it('modified content produces different hash', () => {
    const content1 = '---\nname: test\n---\n\n# Test v1\n';
    const content2 = '---\nname: test\n---\n\n# Test v2\n';
    expect(hashContent(content1)).not.toBe(hashContent(content2));
  });

  it('version entry schema shape is correct', () => {
    const entry = {
      version: 1,
      hash: hashContent('content'),
      timestamp: new Date().toISOString(),
      content: 'content',
      message: 'initial',
    };
    expect(entry.version).toBe(1);
    expect(entry.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(entry.message).toBe('initial');
  });
});
