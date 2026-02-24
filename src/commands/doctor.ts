import fs from 'fs-extra';
import chalk from 'chalk';
import {
  SM_HOME,
  SM_SKILLS_DIR,
  CC_COMMANDS_DIR,
  CC_SKILLS_DIR,
  CODEX_PROMPTS_DIR,
  CODEX_SKILLS_DIR,
  CODEX_LEGACY_SKILLS_DIR,
  sourceRepoDir,
} from '../fs/paths.js';
import { loadState } from '../core/state.js';
import { listSlugs } from '../core/skill.js';
import { validateLink } from '../fs/links.js';
import { readMeta } from '../core/meta.js';
import { findStaleSkills, findUnusedSkills, type SkillMetaEntry } from '../core/analytics.js';
import { getDirectDeps } from '../core/deps.js';
import { loadSourcesRegistry } from '../core/sources.js';

export async function doctorCommand(): Promise<void> {
  console.log(chalk.bold('\n🩺 Skill Manager — Health Check\n'));

  let issues = 0;

  // Check SM home exists
  if (await fs.pathExists(SM_HOME)) {
    console.log(chalk.green('  ✓ Skill manager home exists'));
  } else {
    console.log(chalk.red('  ✗ Skill manager home missing (~/.skill-manager/)'));
    console.log(chalk.dim('    Run `sm import` to initialize'));
    issues++;
  }

  // Check skills dir
  if (await fs.pathExists(SM_SKILLS_DIR)) {
    const slugs = await listSlugs();
    console.log(chalk.green(`  ✓ Canonical store: ${slugs.length} skills`));
  } else {
    console.log(chalk.yellow('  ⚠ No canonical store yet'));
    issues++;
  }

  // Check tool directories
  const dirs = [
    { name: 'CC commands', path: CC_COMMANDS_DIR },
    { name: 'CC skills', path: CC_SKILLS_DIR },
    { name: 'Codex prompts', path: CODEX_PROMPTS_DIR },
    { name: 'Codex skills (~/.agents)', path: CODEX_SKILLS_DIR },
    { name: 'Codex skills (~/.codex, deprecated)', path: CODEX_LEGACY_SKILLS_DIR },
  ];

  for (const dir of dirs) {
    if (await fs.pathExists(dir.path)) {
      console.log(chalk.green(`  ✓ ${dir.name} dir exists`));
    } else {
      console.log(chalk.dim(`  – ${dir.name} dir not found`));
    }
  }

  // Validate all links
  const state = await loadState();
  if (state.links.length > 0) {
    console.log(chalk.bold(`\n  Validating ${state.links.length} symlinks...`));

    let healthy = 0;
    let broken = 0;

    for (const link of state.links) {
      const status = await validateLink(link.linkPath, link.targetPath);
      if (status.health === 'healthy') {
        healthy++;
      } else {
        broken++;
        console.log(chalk.red(`    ✗ ${link.slug} (${link.tool}): ${status.health} — ${status.detail}`));
      }
    }

    if (broken === 0) {
      console.log(chalk.green(`  ✓ All ${healthy} symlinks healthy`));
    } else {
      console.log(chalk.red(`\n  ${broken} broken links found`));
      console.log(chalk.dim('    Run `sm sync --repair` to fix'));
      issues += broken;
    }
  } else {
    console.log(chalk.dim('\n  No deployed links to validate'));
  }

  // Dependency integrity check (per-tool)
  try {
    const deployedByTool = new Map<string, Set<string>>();
    for (const link of state.links) {
      if (!deployedByTool.has(link.tool)) {
        deployedByTool.set(link.tool, new Set());
      }
      deployedByTool.get(link.tool)!.add(link.slug);
    }
    if (deployedByTool.size > 0) {
      let depIssues = 0;
      for (const [tool, slugs] of deployedByTool) {
        for (const slug of slugs) {
          try {
            const deps = await getDirectDeps(slug);
            for (const dep of deps) {
              if (!slugs.has(dep)) {
                console.log(
                  chalk.yellow(
                    `    ⚠ Missing dependency: ${slug} (${tool}) depends on ${dep} but ${dep} is not deployed to ${tool}`,
                  ),
                );
                depIssues++;
              }
            }
          } catch {
            // Skip skills that can't be loaded
          }
        }
      }
      if (depIssues === 0) {
        console.log(chalk.green('  ✓ All dependency requirements satisfied'));
      } else {
        issues += depIssues;
      }
    }
  } catch {
    // Non-critical check
  }

  // Stale skills check
  try {
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
    const stale = findStaleSkills(metas, 30);
    if (stale.length > 0) {
      console.log(chalk.bold('\n  Stale skills (not deployed in 30+ days)'));
      for (const slug of stale) {
        console.log(chalk.yellow(`    ⚠ ${slug}`));
      }
      issues += stale.length;
    }

    // Unused skills check (informational only — not counted as issues)
    const unused = findUnusedSkills(metas, 30);
    if (unused.length > 0) {
      console.log(chalk.bold('\n  Unused skills (not used in 30+ days)'));
      for (const slug of unused) {
        console.log(chalk.dim(`    – ${slug}`));
      }
    }
  } catch {
    // Non-critical check
  }

  // Source health check
  try {
    const registry = await loadSourcesRegistry();
    if (registry.sources.length > 0) {
      console.log(chalk.bold('\n  Sources'));
      let sourceIssues = 0;
      for (const source of registry.sources) {
        const dir = sourceRepoDir(source.name);
        if (!(await fs.pathExists(dir))) {
          console.log(chalk.yellow(`    ⚠ ${source.name}: cloned directory missing`));
          sourceIssues++;
        }
        if (source.lastError) {
          console.log(chalk.yellow(`    ⚠ ${source.name}: last sync error — ${source.lastError}`));
          sourceIssues++;
        }
        if (source.lastSync) {
          const daysSinceSync = (Date.now() - new Date(source.lastSync).getTime()) / (1000 * 60 * 60 * 24);
          if (daysSinceSync > 30) {
            console.log(chalk.yellow(`    ⚠ ${source.name}: not synced in ${Math.floor(daysSinceSync)} days`));
            sourceIssues++;
          }
        }
      }
      if (sourceIssues === 0) {
        console.log(chalk.green(`  ✓ All ${registry.sources.length} sources healthy`));
      } else {
        issues += sourceIssues;
      }
    }
  } catch {
    // Non-critical check
  }

  // Summary
  if (issues === 0) {
    console.log(chalk.bold.green('\n✓ All checks passed.\n'));
  } else {
    console.log(chalk.bold.yellow(`\n⚠ ${issues} issue(s) found.\n`));
  }
}
