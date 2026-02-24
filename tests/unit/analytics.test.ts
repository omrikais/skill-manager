import { describe, it, expect } from 'vitest';
import { findStaleSkills, findUnusedSkills, getUsageStats, type SkillMetaEntry } from '../../src/core/analytics.js';
import type { SkillMeta } from '../../src/core/meta.js';

function makeMeta(overrides: Partial<SkillMeta> = {}): SkillMeta {
  return {
    format: 'skill',
    source: { type: 'created' },
    tags: [],
    deployAs: { cc: 'skill', codex: 'skill' },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('findStaleSkills', () => {
  it('returns empty for empty input', () => {
    expect(findStaleSkills([], 30)).toEqual([]);
  });

  it('returns skills with no lastDeployed', () => {
    const metas: SkillMetaEntry[] = [
      { slug: 'no-deploy', meta: makeMeta() },
    ];
    expect(findStaleSkills(metas, 30)).toEqual(['no-deploy']);
  });

  it('returns skills deployed more than N days ago', () => {
    const old = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    const metas: SkillMetaEntry[] = [
      { slug: 'old-skill', meta: makeMeta({ lastDeployed: old }) },
    ];
    expect(findStaleSkills(metas, 30)).toEqual(['old-skill']);
  });

  it('excludes recently deployed skills', () => {
    const recent = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    const metas: SkillMetaEntry[] = [
      { slug: 'recent-skill', meta: makeMeta({ lastDeployed: recent }) },
    ];
    expect(findStaleSkills(metas, 30)).toEqual([]);
  });

  it('handles mixed stale and fresh skills', () => {
    const old = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    const recent = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const metas: SkillMetaEntry[] = [
      { slug: 'stale', meta: makeMeta({ lastDeployed: old }) },
      { slug: 'fresh', meta: makeMeta({ lastDeployed: recent }) },
      { slug: 'never', meta: makeMeta() },
    ];
    const stale = findStaleSkills(metas, 30);
    expect(stale).toContain('stale');
    expect(stale).toContain('never');
    expect(stale).not.toContain('fresh');
  });

  it('uses the days parameter correctly', () => {
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    const metas: SkillMetaEntry[] = [
      { slug: 'test', meta: makeMeta({ lastDeployed: fiveDaysAgo }) },
    ];
    // 3-day threshold: skill is stale
    expect(findStaleSkills(metas, 3)).toEqual(['test']);
    // 10-day threshold: skill is not stale
    expect(findStaleSkills(metas, 10)).toEqual([]);
  });
});

describe('findUnusedSkills', () => {
  it('returns empty for empty input', () => {
    expect(findUnusedSkills([], 30)).toEqual([]);
  });

  it('returns skills with no lastUsed', () => {
    const metas: SkillMetaEntry[] = [
      { slug: 'never-used', meta: makeMeta() },
    ];
    expect(findUnusedSkills(metas, 30)).toEqual(['never-used']);
  });

  it('returns skills used more than N days ago', () => {
    const old = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    const metas: SkillMetaEntry[] = [
      { slug: 'old-usage', meta: makeMeta({ lastUsed: old }) },
    ];
    expect(findUnusedSkills(metas, 30)).toEqual(['old-usage']);
  });

  it('excludes recently used skills', () => {
    const recent = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    const metas: SkillMetaEntry[] = [
      { slug: 'active', meta: makeMeta({ lastUsed: recent, usageCount: 3 }) },
    ];
    expect(findUnusedSkills(metas, 30)).toEqual([]);
  });

  it('handles mixed used and unused skills', () => {
    const old = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    const recent = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const metas: SkillMetaEntry[] = [
      { slug: 'stale', meta: makeMeta({ lastUsed: old }) },
      { slug: 'active', meta: makeMeta({ lastUsed: recent }) },
      { slug: 'never', meta: makeMeta() },
    ];
    const unused = findUnusedSkills(metas, 30);
    expect(unused).toContain('stale');
    expect(unused).toContain('never');
    expect(unused).not.toContain('active');
  });
});

describe('getUsageStats', () => {
  it('returns empty for empty input', () => {
    expect(getUsageStats([])).toEqual([]);
  });

  it('returns stats sorted by usage count descending', () => {
    const metas: SkillMetaEntry[] = [
      { slug: 'low', meta: makeMeta({ usageCount: 1 }) },
      { slug: 'high', meta: makeMeta({ usageCount: 10 }) },
      { slug: 'mid', meta: makeMeta({ usageCount: 5 }) },
    ];
    const stats = getUsageStats(metas);
    expect(stats.map((s) => s.slug)).toEqual(['high', 'mid', 'low']);
  });

  it('includes lastUsed and lastDeployed fields', () => {
    const now = new Date().toISOString();
    const metas: SkillMetaEntry[] = [
      { slug: 'test', meta: makeMeta({ usageCount: 3, lastUsed: now, lastDeployed: now }) },
    ];
    const stats = getUsageStats(metas);
    expect(stats[0]).toEqual({
      slug: 'test',
      usageCount: 3,
      lastUsed: now,
      lastDeployed: now,
    });
  });

  it('defaults usageCount to 0 for skills without it', () => {
    const metas: SkillMetaEntry[] = [
      { slug: 'no-count', meta: makeMeta() },
    ];
    const stats = getUsageStats(metas);
    expect(stats[0].usageCount).toBe(0);
  });
});
