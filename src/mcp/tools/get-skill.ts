import { z } from 'zod';
import fs from 'fs-extra';
import { loadSkill, getSkillFiles } from '../../core/skill.js';
import { getLinkRecords } from '../../core/state.js';
import { skillFile } from '../../fs/paths.js';
import { validateSlug } from '../../utils/errors.js';
import { withToolHandler } from './helpers.js';

export const getSkillSchema = z.object({
  slug: z.string().describe('Skill identifier'),
});

export const getSkillHandler = withToolHandler(
  async (args: z.infer<typeof getSkillSchema>) => {
    validateSlug(args.slug);
    const skill = await loadSkill(args.slug);
    const links = await getLinkRecords(args.slug);
    const files = await getSkillFiles(args.slug);
    const rawContent = await fs.readFile(skillFile(args.slug), 'utf-8');

    return {
      slug: skill.slug,
      name: skill.name,
      description: skill.description,
      tags: skill.tags,
      content: rawContent,
      meta: skill.meta,
      deployedTo: [...new Set(links.map((l) => l.tool))],
      files,
    };
  },
);
