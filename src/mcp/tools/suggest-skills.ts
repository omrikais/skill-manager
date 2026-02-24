import { z } from 'zod';
import { scanProjectSignals, matchSkillTriggers } from '../../core/triggers.js';
import { deploy } from '../../deploy/engine.js';
import { buildDepGraph, resolveDeps } from '../../core/deps.js';
import { getLinkRecords } from '../../core/state.js';
import { resolveProjectRoot, type ToolName } from '../../fs/paths.js';
import { withToolHandler } from './helpers.js';

export const suggestSkillsSchema = z.object({
  project_root: z.string().describe('Directory to scan'),
  auto_deploy: z.boolean().optional().describe('Deploy matching skills (default: false)'),
});

export const suggestSkillsHandler = withToolHandler(
  async (args: z.infer<typeof suggestSkillsSchema>) => {
    const projectRoot = resolveProjectRoot(args.project_root);
    const signals = await scanProjectSignals(projectRoot);
    const suggestions = await matchSkillTriggers(signals, undefined, projectRoot);

    if (args.auto_deploy) {
      const deployed: string[] = [];
      const tools: ToolName[] = ['cc', 'codex'];
      const graph = await buildDepGraph();

      for (const s of suggestions) {
        if (s.isDeployed) continue;

        // Resolve dependencies — skip skills with circular or missing deps
        const resolved = resolveDeps(s.slug, graph);
        if (resolved.circular || resolved.missing.length > 0) continue;

        // Deploy deps in topological order, tracking per-tool failures
        const failedTools = new Set<ToolName>();
        for (const dep of resolved.ordered) {
          if (dep === s.slug) continue;
          for (const tool of tools) {
            if (failedTools.has(tool)) continue;
            const existing = await getLinkRecords(dep, { scope: 'user' });
            const alreadyDeployed = existing.some((r) => r.tool === tool);
            if (!alreadyDeployed) {
              try {
                const result = await deploy(dep, tool);
                if (result.action === 'skipped') failedTools.add(tool);
              } catch {
                failedTools.add(tool);
              }
            }
          }
        }

        // Deploy the skill itself (only to tools where deps succeeded)
        let didDeploy = false;
        for (const tool of tools) {
          if (failedTools.has(tool)) continue;
          try {
            const result = await deploy(s.slug, tool);
            if (result.action === 'deployed') didDeploy = true;
          } catch {
            // Skip tools that fail to deploy
          }
        }
        if (didDeploy) deployed.push(s.slug);
      }

      return { suggestions, deployed };
    }

    return { suggestions };
  },
);
