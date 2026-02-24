import type { SkillMeta } from './meta.js';

export interface SkillMetaEntry {
  slug: string;
  meta: SkillMeta;
}

export interface UsageStat {
  slug: string;
  usageCount: number;
  lastUsed?: string;
  lastDeployed?: string;
}

/**
 * Find skills that haven't been deployed within the given number of days.
 * Skills with no lastDeployed timestamp are always considered stale.
 */
export function findStaleSkills(metas: SkillMetaEntry[], days: number): string[] {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

  return metas
    .filter((entry) => {
      if (!entry.meta.lastDeployed) return true;
      const deployedAt = new Date(entry.meta.lastDeployed).getTime();
      return deployedAt < cutoff;
    })
    .map((entry) => entry.slug);
}

/**
 * Find skills that haven't been used within the given number of days.
 * Skills with no lastUsed timestamp are always considered unused.
 */
export function findUnusedSkills(metas: SkillMetaEntry[], days: number): string[] {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

  return metas
    .filter((entry) => {
      if (!entry.meta.lastUsed) return true;
      const usedAt = new Date(entry.meta.lastUsed).getTime();
      return usedAt < cutoff;
    })
    .map((entry) => entry.slug);
}

/**
 * Get usage statistics for all skills, sorted by most used first.
 */
export function getUsageStats(metas: SkillMetaEntry[]): UsageStat[] {
  return metas
    .map((entry) => ({
      slug: entry.slug,
      usageCount: entry.meta.usageCount ?? 0,
      lastUsed: entry.meta.lastUsed,
      lastDeployed: entry.meta.lastDeployed,
    }))
    .sort((a, b) => b.usageCount - a.usageCount);
}
