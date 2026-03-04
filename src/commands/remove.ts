import chalk from 'chalk';
import { skillExists, deleteSkill } from '../core/skill.js';
import { undeploy, undeployProject } from '../deploy/engine.js';
import { buildDepGraph, getDependents } from '../core/deps.js';
import { getLinkRecords, loadState, saveState } from '../core/state.js';
import { removeLink } from '../fs/links.js';
import { type ToolName } from '../fs/paths.js';
import { SmError, SkillNotFoundError, UsageError } from '../utils/errors.js';

interface RemoveOptions {
  cc?: boolean;
  codex?: boolean;
  purge?: boolean;
  force?: boolean;
  project?: boolean;
}

export async function removeCommand(name: string, opts: RemoveOptions): Promise<void> {
  if (!(await skillExists(name))) {
    // Skill dir is gone — clean up orphaned state records and dangling symlinks
    const orphanedLinks = await getLinkRecords(name);
    if (orphanedLinks.length > 0) {
      for (const link of orphanedLinks) {
        await removeLink(link.linkPath);
      }
      const state = await loadState();
      state.links = state.links.filter((l) => l.slug !== name);
      await saveState(state);
      console.log(chalk.green(`✓ Cleaned up ${orphanedLinks.length} orphaned link record(s) for "${name}"`));
      return;
    }
    throw new SkillNotFoundError(name);
  }

  const isProject = !!opts.project;
  const projectRoot = isProject ? process.cwd() : undefined;

  if (isProject && opts.purge) {
    throw new UsageError('Cannot purge from project scope');
  }

  const tools = resolveTools(opts);

  // Check for dependents unless --force
  if (!opts.force) {
    try {
      const scopeOpts = isProject ? { scope: 'project' as const, projectRoot } : { scope: 'user' as const };

      // When purging, the canonical store is shared across all tools,
      // so any deployed dependent on ANY tool is at risk
      const targetLinks = await getLinkRecords(name, opts.purge ? undefined : scopeOpts);
      const activeTools = opts.purge
        ? null // null = match all tools
        : tools.filter((t) => targetLinks.some((l) => l.tool === t));

      const graph = await buildDepGraph();
      const dependents = getDependents(name, graph);
      const deployedDependents: string[] = [];
      for (const dep of dependents) {
        // Purge destroys the canonical store shared by all scopes,
        // so check dependents across all scopes
        const links = await getLinkRecords(dep, opts.purge ? undefined : scopeOpts);
        const hasOverlap =
          activeTools === null ? links.length > 0 : links.some((l) => activeTools.includes(l.tool as ToolName));
        if (hasOverlap) {
          deployedDependents.push(dep);
        }
      }
      if (deployedDependents.length > 0) {
        throw new SmError(
          `Cannot remove ${name}: deployed skills depend on it (${deployedDependents.join(', ')}). Use --force to remove anyway.`,
          'HAS_DEPENDENTS',
        );
      }
    } catch (err) {
      // Re-throw intentional blocks; swallow unexpected dep-check failures
      if (err instanceof SmError) throw err;
    }
  }

  for (const tool of tools) {
    const result = isProject ? await undeployProject(name, tool, projectRoot!) : await undeploy(name, tool);
    switch (result.action) {
      case 'undeployed':
        console.log(chalk.green(`✓ Removed ${name} from ${tool}${isProject ? ' (project)' : ''}`));
        break;
      case 'skipped':
        console.log(chalk.dim(`– ${name} was not deployed to ${tool}${isProject ? ' (project)' : ''}`));
        break;
    }
  }

  if (opts.purge) {
    await deleteSkill(name);
    console.log(chalk.green(`✓ Purged ${name} (all deployments removed, canonical store deleted)`));
  }
}

function resolveTools(opts: RemoveOptions): ToolName[] {
  const tools: ToolName[] = [];
  if (opts.cc) tools.push('cc');
  if (opts.codex) tools.push('codex');
  return tools.length > 0 ? tools : ['cc', 'codex'];
}
