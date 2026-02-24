import { z } from 'zod';
import { listSkills } from '../../core/skill.js';
import { getLinkRecords } from '../../core/state.js';
import { withToolHandler } from './helpers.js';

export const searchSkillsSchema = z.object({
  query: z.string().describe('Search term'),
});

export const searchSkillsHandler = withToolHandler(
  async (args: z.infer<typeof searchSkillsSchema>) => {
    const skills = await listSkills();
    const q = args.query.toLowerCase();

    const matches = skills.filter((skill) => {
      if (skill.slug.includes(q)) return true;
      if (skill.name.toLowerCase().includes(q)) return true;
      if (skill.description.toLowerCase().includes(q)) return true;
      if (skill.tags.some((t) => t.toLowerCase().includes(q))) return true;
      if (skill.content.content.toLowerCase().includes(q)) return true;
      return false;
    });

    const links = await getLinkRecords();

    return matches.map((s) => {
      const skillLinks = links.filter((l) => l.slug === s.slug);
      return {
        slug: s.slug,
        name: s.name,
        description: s.description,
        tags: s.tags,
        deployedTo: [...new Set(skillLinks.map((l) => l.tool))],
      };
    });
  },
);
