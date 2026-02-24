import { scanProjectSignals, matchSkillTriggers, type SkillSuggestion } from './triggers.js';
import { recordUsage } from './meta.js';
import { deploy } from '../deploy/engine.js';
import { getLinkRecords } from './state.js';
import { readMeta } from './meta.js';
import { listSkills } from './skill.js';
import { buildDepGraph, resolveDeps } from './deps.js';
import fs from 'fs-extra';
import type { ToolName } from '../fs/paths.js';

export interface HookInput {
  session_id: string;
  cwd: string;
  source: string;
}

export interface HookResult {
  projectRoot: string;
  suggestions: SkillSuggestion[];
  deployed: string[];
  alreadyActive: string[];
  contextOutput: string;
}

/**
 * Handle a session-start hook event.
 * Scans project signals, matches triggers, auto-deploys undeployed suggestions
 * (with dependency resolution), records usage only for successfully activated
 * skills, and builds context output text.
 */
export async function handleSessionStart(input: HookInput): Promise<HookResult> {
  const projectRoot = input.cwd;
  const signals = await scanProjectSignals(projectRoot);
  const skills = await listSkills();
  const suggestions = await matchSkillTriggers(signals, skills, projectRoot);

  if (suggestions.length === 0) {
    return {
      projectRoot,
      suggestions: [],
      deployed: [],
      alreadyActive: [],
      contextOutput: '',
    };
  }

  const deployed: string[] = [];
  const alreadyActive: string[] = [];

  // Build dep graph once for all suggestions
  let depGraph;
  try {
    depGraph = await buildDepGraph();
  } catch {
    depGraph = null;
  }

  for (const suggestion of suggestions) {
    if (suggestion.isDeployed) {
      // Verify at least one symlink actually exists on disk before trusting state
      // Scope to user + current project links, matching the filter in triggers.ts
      const allLinks = await getLinkRecords(suggestion.slug);
      const links = allLinks.filter((l) => {
        const s = l.scope ?? 'user';
        if (s === 'user') return true;
        return l.projectRoot === projectRoot;
      });
      const linksHealthy = links.length > 0 && (
        await Promise.all(links.map((l) => fs.pathExists(l.linkPath)))
      ).every(Boolean);

      if (linksHealthy) {
        alreadyActive.push(suggestion.slug);
        try { await recordUsage(suggestion.slug); } catch { /* non-critical */ }
        continue;
      }
      // Links are stale — fall through to deploy path for repair
    }

    // Auto-deploy: determine target tools
    try {
      const meta = await readMeta(suggestion.slug);
      const tools: ToolName[] = [];
      if (meta.deployAs.cc !== 'none') tools.push('cc');
      if (meta.deployAs.codex !== 'none') tools.push('codex');

      if (tools.length === 0) continue; // Nothing deployable — skip entirely

      // Resolve and deploy dependencies first, tracking per-tool failures
      const failedTools = new Set<ToolName>();
      if (depGraph) {
        const resolved = resolveDeps(suggestion.slug, depGraph);
        if (resolved.circular || resolved.missing.length > 0) {
          // Can't satisfy deps — skip this skill
          continue;
        }
        // Deploy deps in topological order (everything before the skill itself)
        for (const dep of resolved.ordered) {
          if (dep === suggestion.slug) continue;
          for (const tool of tools) {
            if (failedTools.has(tool)) continue;
            const existing = await getLinkRecords(dep, { scope: 'user' });
            const record = existing.find((r) => r.tool === tool);
            if (!record || !(await fs.pathExists(record.linkPath))) {
              try {
                const result = await deploy(dep, tool);
                if (result.action === 'skipped') {
                  failedTools.add(tool);
                }
              } catch {
                failedTools.add(tool);
              }
            }
          }
        }
      }

      // Deploy the skill itself (only to tools where all deps succeeded)
      let deployedCount = 0;
      for (const tool of tools) {
        if (failedTools.has(tool)) continue;
        const existing = await getLinkRecords(suggestion.slug, { scope: 'user' });
        const record = existing.find((r) => r.tool === tool);
        if (!record || !(await fs.pathExists(record.linkPath))) {
          try {
            const result = await deploy(suggestion.slug, tool);
            if (result.action === 'deployed') deployedCount++;
          } catch {
            // Per-tool failure — continue with remaining tools
          }
        } else {
          deployedCount++; // Verified symlink present for this tool
        }
      }

      if (deployedCount > 0) {
        deployed.push(suggestion.slug);
        // Record usage only after successful deployment
        try { await recordUsage(suggestion.slug); } catch { /* non-critical */ }
      }
    } catch {
      // Non-critical — skip skills that fail to deploy
    }
  }

  const contextOutput = buildContextOutput(suggestions, deployed, alreadyActive);

  return {
    projectRoot,
    suggestions,
    deployed,
    alreadyActive,
    contextOutput,
  };
}

/**
 * Build context output text for display.
 */
export function buildContextOutput(
  suggestions: SkillSuggestion[],
  deployed: string[],
  alreadyActive: string[],
): string {
  if (suggestions.length === 0) return '';

  // Only show skills that were actually activated or deployed
  const activeSlugs = new Set([...deployed, ...alreadyActive]);
  const activeSkills = suggestions.filter((s) => activeSlugs.has(s.slug));

  if (activeSkills.length === 0) return '';

  const lines: string[] = ['[Skill Manager] Project-relevant skills activated:'];

  for (const s of activeSkills) {
    const status = deployed.includes(s.slug) ? 'deployed' : 'active';
    const triggers = s.matchedTriggers.join(', ');
    lines.push(`  ${s.name} (${s.slug}) [${s.confidence}] — ${status} — matched: ${triggers}`);
  }

  return lines.join('\n');
}
