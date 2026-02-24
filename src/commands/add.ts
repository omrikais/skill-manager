import chalk from 'chalk';
import { skillExists } from '../core/skill.js';
import { readMeta } from '../core/meta.js';
import { deploy, deployToProject } from '../deploy/engine.js';
import { buildDepGraph, resolveDeps } from '../core/deps.js';
import { getLinkRecords } from '../core/state.js';
import type { ToolName } from '../fs/paths.js';
import { SmError, SkillNotFoundError, CyclicDependencyError } from '../utils/errors.js';

interface AddOptions {
  cc?: boolean;
  codex?: boolean;
  all?: boolean;
  deps?: boolean;
  project?: boolean;
}

export async function addCommand(name: string, opts: AddOptions): Promise<number> {
  if (!(await skillExists(name))) {
    throw new SkillNotFoundError(name);
  }

  const requestedTools = resolveTools(opts);
  const isProject = !!opts.project;
  const projectRoot = isProject ? process.cwd() : undefined;

  // Filter to tools where the target skill actually has a deploy format
  const meta = await readMeta(name);
  const tools = isProject
    ? requestedTools  // Project scope always uses 'skill' format
    : requestedTools.filter((tool) => {
        const format = tool === 'cc' ? meta.deployAs.cc : meta.deployAs.codex;
        return format !== 'none';
      });

  // Resolve dependencies unless --no-deps
  const failedTools = new Set<ToolName>();
  if (opts.deps !== false && tools.length > 0) {
    const graph = await buildDepGraph();
    const resolved = resolveDeps(name, graph);

    if (resolved.circular) {
      throw new CyclicDependencyError(resolved.circular);
    }

    if (resolved.missing.length > 0) {
      throw new SmError(
        `Missing dependencies for ${name}: ${resolved.missing.join(', ')}. Install them first or use --no-deps to skip.`,
        'MISSING_DEPS',
      );
    }

    // Deploy dependencies first (everything except the target itself)
    for (const dep of resolved.ordered) {
      if (dep === name) continue;
      for (const tool of tools) {
        if (failedTools.has(tool)) continue;
        const scopeOpts = isProject
          ? { scope: 'project' as const, projectRoot }
          : { scope: 'user' as const };
        const existing = await getLinkRecords(dep, scopeOpts);
        const alreadyDeployed = existing.some((r) => r.tool === tool);
        if (!alreadyDeployed) {
          const result = isProject
            ? await deployToProject(dep, tool, projectRoot!)
            : await deploy(dep, tool);
          if (result.action === 'deployed') {
            const scopeLabel = isProject ? 'project' : result.format;
            console.log(chalk.green(`✓ Deployed dependency: ${dep} to ${tool} (${scopeLabel})`));
          } else if (result.action === 'skipped') {
            console.log(chalk.yellow(`⚠ Dependency ${dep} has no deploy format for ${tool} — skipping ${name} for ${tool}`));
            failedTools.add(tool);
          }
        }
      }
    }
  }

  let deployedCount = 0;
  for (const tool of requestedTools) {
    if (!tools.includes(tool)) {
      console.log(chalk.yellow(`– ${name} has no deploy format for ${tool}, skipped`));
      continue;
    }
    if (failedTools.has(tool)) {
      continue;
    }
    const result = isProject
      ? await deployToProject(name, tool, projectRoot!)
      : await deploy(name, tool);
    if (result.action === 'deployed') {
      const scopeLabel = isProject ? 'project' : result.format;
      console.log(chalk.green(`✓ Deployed ${name} to ${tool} (${scopeLabel})`));
      deployedCount++;
    }
  }
  return deployedCount;
}

function resolveTools(opts: AddOptions): ToolName[] {
  if (opts.all) return ['cc', 'codex'];
  const tools: ToolName[] = [];
  if (opts.cc) tools.push('cc');
  if (opts.codex) tools.push('codex');
  return tools.length > 0 ? tools : ['cc', 'codex'];
}
