import { describe, it, expect } from 'vitest';
import {
  buildDepGraphFromData,
  resolveDeps,
  getDependents,
  detectCycle,
  type DepGraph,
} from '../../src/core/deps.js';

describe('buildDepGraphFromData', () => {
  it('builds a graph from skill data', () => {
    const graph = buildDepGraphFromData([
      { slug: 'a', depends: ['b'] },
      { slug: 'b', depends: [] },
    ]);
    expect(graph.edges.get('a')).toEqual(['b']);
    expect(graph.edges.get('b')).toEqual([]);
  });

  it('handles empty input', () => {
    const graph = buildDepGraphFromData([]);
    expect(graph.edges.size).toBe(0);
  });
});

describe('resolveDeps', () => {
  it('resolves a linear chain A→B→C', () => {
    const graph = buildDepGraphFromData([
      { slug: 'a', depends: ['b'] },
      { slug: 'b', depends: ['c'] },
      { slug: 'c', depends: [] },
    ]);
    const result = resolveDeps('a', graph);
    expect(result.circular).toBeNull();
    expect(result.missing).toEqual([]);
    // c first, then b, then a
    expect(result.ordered).toEqual(['c', 'b', 'a']);
  });

  it('resolves a diamond: A→B,C; B→D; C→D', () => {
    const graph = buildDepGraphFromData([
      { slug: 'a', depends: ['b', 'c'] },
      { slug: 'b', depends: ['d'] },
      { slug: 'c', depends: ['d'] },
      { slug: 'd', depends: [] },
    ]);
    const result = resolveDeps('a', graph);
    expect(result.circular).toBeNull();
    expect(result.missing).toEqual([]);
    // d must come before b and c, a must come last
    const dIdx = result.ordered.indexOf('d');
    const bIdx = result.ordered.indexOf('b');
    const cIdx = result.ordered.indexOf('c');
    const aIdx = result.ordered.indexOf('a');
    expect(dIdx).toBeLessThan(bIdx);
    expect(dIdx).toBeLessThan(cIdx);
    expect(aIdx).toBe(result.ordered.length - 1);
  });

  it('detects missing dependencies', () => {
    const graph = buildDepGraphFromData([
      { slug: 'a', depends: ['missing-dep'] },
    ]);
    const result = resolveDeps('a', graph);
    expect(result.missing).toEqual(['missing-dep']);
    expect(result.circular).toBeNull();
  });

  it('detects circular dependencies', () => {
    const graph = buildDepGraphFromData([
      { slug: 'a', depends: ['b'] },
      { slug: 'b', depends: ['a'] },
    ]);
    const result = resolveDeps('a', graph);
    expect(result.circular).not.toBeNull();
    expect(result.circular).toContain('a');
    expect(result.circular).toContain('b');
  });

  it('handles no dependencies', () => {
    const graph = buildDepGraphFromData([
      { slug: 'a', depends: [] },
    ]);
    const result = resolveDeps('a', graph);
    expect(result.ordered).toEqual(['a']);
    expect(result.missing).toEqual([]);
    expect(result.circular).toBeNull();
  });
});

describe('getDependents', () => {
  it('finds reverse dependencies', () => {
    const graph = buildDepGraphFromData([
      { slug: 'a', depends: ['c'] },
      { slug: 'b', depends: ['c'] },
      { slug: 'c', depends: [] },
    ]);
    const dependents = getDependents('c', graph);
    expect(dependents).toContain('a');
    expect(dependents).toContain('b');
    expect(dependents).not.toContain('c');
  });

  it('returns empty array when nothing depends on slug', () => {
    const graph = buildDepGraphFromData([
      { slug: 'a', depends: [] },
      { slug: 'b', depends: [] },
    ]);
    expect(getDependents('a', graph)).toEqual([]);
  });
});

describe('detectCycle', () => {
  it('returns null for acyclic graph', () => {
    const graph = buildDepGraphFromData([
      { slug: 'a', depends: ['b'] },
      { slug: 'b', depends: [] },
    ]);
    expect(detectCycle('a', graph)).toBeNull();
  });

  it('detects a simple cycle', () => {
    const graph = buildDepGraphFromData([
      { slug: 'a', depends: ['b'] },
      { slug: 'b', depends: ['a'] },
    ]);
    const cycle = detectCycle('a', graph);
    expect(cycle).not.toBeNull();
    expect(cycle!.length).toBeGreaterThanOrEqual(2);
  });

  it('detects a longer cycle A→B→C→A', () => {
    const graph = buildDepGraphFromData([
      { slug: 'a', depends: ['b'] },
      { slug: 'b', depends: ['c'] },
      { slug: 'c', depends: ['a'] },
    ]);
    const cycle = detectCycle('a', graph);
    expect(cycle).not.toBeNull();
    expect(cycle).toContain('a');
    expect(cycle).toContain('b');
    expect(cycle).toContain('c');
  });

  it('returns null for slug not in graph', () => {
    const graph = buildDepGraphFromData([]);
    expect(detectCycle('nonexistent', graph)).toBeNull();
  });
});
