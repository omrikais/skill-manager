import { z } from 'zod';
import { skillExists } from '../../core/skill.js';
import { undeploy, undeployProject } from '../../deploy/engine.js';
import { buildDepGraph, getDependents } from '../../core/deps.js';
import { getLinkRecords } from '../../core/state.js';
import type { ToolName } from '../../fs/paths.js';
import { SkillNotFoundError, SmError, validateSlug } from '../../utils/errors.js';
import { withToolHandler } from './helpers.js';

export const undeploySkillSchema = z.object({
  slug: z.string().describe('Skill identifier'),
  tool: z.enum(['cc', 'codex', 'all']).optional().describe('Target tool (default: all)'),
  scope: z.enum(['user', 'project']).optional().describe('Undeploy scope (default: user)'),
  project_root: z.string().optional().describe('Required for project scope'),
  force: z.boolean().optional().describe('Skip dependent safety check (default: false)'),
});

export const undeploySkillHandler = withToolHandler(
  async (args: z.infer<typeof undeploySkillSchema>) => {
    const { slug, tool = 'all', scope = 'user', project_root, force = false } = args;
    validateSlug(slug);

    if (!(await skillExists(slug))) {
      throw new SkillNotFoundError(slug);
    }

    if (scope === 'project' && !project_root) {
      throw new SmError('project_root is required when scope is project', 'USAGE_ERROR');
    }

    const isProject = scope === 'project';
    const projectRoot = project_root;
    const tools: ToolName[] = tool === 'all' ? ['cc', 'codex'] : [tool];

    // Check for dependents unless force
    if (!force) {
      const scopeOpts = isProject
        ? { scope: 'project' as const, projectRoot }
        : { scope: 'user' as const };

      const targetLinks = await getLinkRecords(slug, scopeOpts);
      const activeTools = tools.filter((t) => targetLinks.some((l) => l.tool === t));

      if (activeTools.length > 0) {
        const graph = await buildDepGraph();
        const dependents = getDependents(slug, graph);
        const deployedDependents: string[] = [];

        for (const dep of dependents) {
          const links = await getLinkRecords(dep, scopeOpts);
          const hasOverlap = links.some((l) => activeTools.includes(l.tool as ToolName));
          if (hasOverlap) {
            deployedDependents.push(dep);
          }
        }

        if (deployedDependents.length > 0) {
          throw new SmError(
            `Cannot remove ${slug}: deployed skills depend on it (${deployedDependents.join(', ')}). Use force: true to remove anyway.`,
            'HAS_DEPENDENTS',
          );
        }
      }
    }

    const results: Array<{ tool: string; action: string; scope: string }> = [];
    for (const t of tools) {
      const result = isProject
        ? await undeployProject(slug, t, projectRoot!)
        : await undeploy(slug, t);
      results.push({
        tool: t,
        action: result.action,
        scope,
      });
    }

    return { slug, results };
  },
);
