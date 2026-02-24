import { z } from 'zod';
import { listSkills } from '../../core/skill.js';
import { getLinkRecords } from '../../core/state.js';
import { withToolHandler } from './helpers.js';

export const listSkillsSchema = z.object({
  tag: z.string().optional().describe('Filter by tag'),
  deployed_only: z.boolean().optional().describe('Show only deployed skills'),
});

export const listSkillsHandler = withToolHandler(
  async (args: z.infer<typeof listSkillsSchema>) => {
    let skills = await listSkills();
    const links = await getLinkRecords();

    if (args.tag) {
      const tag = args.tag.toLowerCase();
      skills = skills.filter((s) =>
        s.tags.some((t) => t.toLowerCase() === tag),
      );
    }

    const results = skills.map((s) => {
      const skillLinks = links.filter((l) => l.slug === s.slug);
      return {
        slug: s.slug,
        name: s.name,
        description: s.description,
        tags: s.tags,
        deployedTo: [...new Set(skillLinks.map((l) => l.tool))],
      };
    });

    if (args.deployed_only) {
      return results.filter((r) => r.deployedTo.length > 0);
    }

    return results;
  },
);
