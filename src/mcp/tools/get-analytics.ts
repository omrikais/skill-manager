import { z } from 'zod';
import { listSlugs } from '../../core/skill.js';
import { readMeta } from '../../core/meta.js';
import {
  getUsageStats,
  findStaleSkills,
  findUnusedSkills,
  type SkillMetaEntry,
} from '../../core/analytics.js';
import { withToolHandler } from './helpers.js';

export const getAnalyticsSchema = z.object({
  stale_days: z.number().optional().describe('Threshold for stale detection (default: 30)'),
  unused_days: z.number().optional().describe('Threshold for unused detection (default: 30)'),
});

export const getAnalyticsHandler = withToolHandler(
  async (args: z.infer<typeof getAnalyticsSchema>) => {
    const staleDays = args.stale_days ?? 30;
    const unusedDays = args.unused_days ?? 30;

    const slugs = await listSlugs();
    const metas: SkillMetaEntry[] = [];

    for (const slug of slugs) {
      try {
        const meta = await readMeta(slug);
        metas.push({ slug, meta });
      } catch {
        // Skip skills with unreadable meta
      }
    }

    const stats = getUsageStats(metas);
    const stale = findStaleSkills(metas, staleDays);
    const unused = findUnusedSkills(metas, unusedDays);

    return {
      totalSkills: slugs.length,
      stats,
      stale,
      unused,
    };
  },
);
