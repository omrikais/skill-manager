import { z } from 'zod';
import { skillExists } from '../../core/skill.js';
import { readMeta } from '../../core/meta.js';
import { deploy, deployToProject } from '../../deploy/engine.js';
import { buildDepGraph, resolveDeps } from '../../core/deps.js';
import { getLinkRecords } from '../../core/state.js';
import type { ToolName } from '../../fs/paths.js';
import { SkillNotFoundError, SmError, validateSlug } from '../../utils/errors.js';
import { withToolHandler } from './helpers.js';

export const deploySkillSchema = z.object({
  slug: z.string().describe('Skill identifier'),
  tool: z.enum(['cc', 'codex', 'all']).optional().describe('Target tool (default: all)'),
  scope: z.enum(['user', 'project']).optional().describe('Deploy scope (default: user)'),
  project_root: z.string().optional().describe('Required when scope is project'),
  resolve_deps: z.boolean().optional().describe('Auto-deploy dependencies (default: true)'),
});

export const deploySkillHandler = withToolHandler(
  async (args: z.infer<typeof deploySkillSchema>) => {
    const { slug, tool = 'all', scope = 'user', project_root, resolve_deps = true } = args;
    validateSlug(slug);

    if (!(await skillExists(slug))) {
      throw new SkillNotFoundError(slug);
    }

    if (scope === 'project' && !project_root) {
      throw new SmError('project_root is required when scope is project', 'USAGE_ERROR');
    }

    const isProject = scope === 'project';
    const projectRoot = project_root;
    const requestedTools: ToolName[] = tool === 'all' ? ['cc', 'codex'] : [tool];

    // Filter to tools with a deploy format (user scope only)
    const meta = await readMeta(slug);
    const tools = isProject
      ? requestedTools
      : requestedTools.filter((t) => {
          const format = t === 'cc' ? meta.deployAs.cc : meta.deployAs.codex;
          return format !== 'none';
        });

    // Resolve dependencies
    const failedTools = new Set<ToolName>();
    if (resolve_deps && tools.length > 0) {
      const graph = await buildDepGraph();
      const resolved = resolveDeps(slug, graph);

      if (resolved.circular) {
        throw new SmError(
          `Circular dependency detected: ${resolved.circular.join(' → ')}`,
          'CYCLIC_DEPENDENCY',
        );
      }

      if (resolved.missing.length > 0) {
        throw new SmError(
          `Missing dependencies: ${resolved.missing.join(', ')}`,
          'MISSING_DEPS',
        );
      }

      for (const dep of resolved.ordered) {
        if (dep === slug) continue;
        for (const t of tools) {
          if (failedTools.has(t)) continue;
          const scopeOpts = isProject
            ? { scope: 'project' as const, projectRoot }
            : { scope: 'user' as const };
          const existing = await getLinkRecords(dep, scopeOpts);
          const alreadyDeployed = existing.some((r) => r.tool === t);
          if (!alreadyDeployed) {
            const result = isProject
              ? await deployToProject(dep, t, projectRoot!)
              : await deploy(dep, t);
            if (result.action === 'skipped') {
              failedTools.add(t);
            }
          }
        }
      }
    }

    const results: Array<{ tool: string; action: string; format: string; scope: string }> = [];
    for (const t of requestedTools) {
      if (!tools.includes(t)) {
        results.push({ tool: t, action: 'skipped', format: 'none', scope });
        continue;
      }
      if (failedTools.has(t)) {
        results.push({ tool: t, action: 'skipped', format: 'dep-failed', scope });
        continue;
      }
      const result = isProject
        ? await deployToProject(slug, t, projectRoot!)
        : await deploy(slug, t);
      results.push({
        tool: t,
        action: result.action,
        format: result.format,
        scope,
      });
    }

    return { slug, results };
  },
);
