import chalk from 'chalk';
import { loadState, updateLastSync, type LinkRecord } from '../core/state.js';
import { validateLink, repairLink, type LinkStatus } from '../fs/links.js';
import { deployLinkPath, type ToolName, type DeployFormat } from '../fs/paths.js';
import { deploy, undeploy } from '../deploy/engine.js';
import { readMeta, writeMeta } from '../core/meta.js';

interface SyncOptions {
  dryRun?: boolean;
  repair?: boolean;
}

export async function syncCommand(opts: SyncOptions): Promise<void> {
  const state = await loadState();
  const links = state.links;

  if (links.length === 0) {
    console.log(chalk.yellow('No deployed skills found. Run `sm import` first.'));
    return;
  }

  // Detect deprecated links: wrong path or deprecated format (legacy-prompt)
  const deprecated: Array<LinkRecord & { reason: 'path' | 'format'; canonicalPath: string }> = [];
  const currentLinks: LinkRecord[] = [];
  for (const link of links) {
    if ((link.scope ?? 'user') !== 'user') {
      currentLinks.push(link);
      continue;
    }
    // Deprecated format: legacy-prompt should migrate to skill
    if (link.format === 'legacy-prompt' && link.tool === 'codex') {
      const canonicalPath = deployLinkPath('codex', 'skill', link.slug)!;
      deprecated.push({ ...link, reason: 'format', canonicalPath });
      continue;
    }
    // Deprecated path: link path differs from current canonical
    const canonicalPath = deployLinkPath(link.tool as ToolName, link.format as DeployFormat, link.slug);
    if (canonicalPath && link.linkPath !== canonicalPath) {
      deprecated.push({ ...link, reason: 'path', canonicalPath });
    } else {
      currentLinks.push(link);
    }
  }

  console.log(chalk.bold(`\nValidating ${links.length} symlinks...\n`));

  if (deprecated.length > 0) {
    console.log(`  ${chalk.cyan('●')} Deprecated path: ${deprecated.length}`);
  }

  const results: Array<LinkRecord & { status: LinkStatus }> = [];

  for (const link of currentLinks) {
    const status = await validateLink(link.linkPath, link.targetPath);
    results.push({ ...link, status });
  }

  // Summary
  const healthy = results.filter((r) => r.status.health === 'healthy');
  const broken = results.filter((r) => r.status.health === 'broken');
  const missing = results.filter((r) => r.status.health === 'missing');
  const stale = results.filter((r) => r.status.health === 'stale');
  const conflicts = results.filter((r) => r.status.health === 'conflict');

  console.log(`  ${chalk.green('●')} Healthy:  ${healthy.length}`);
  console.log(`  ${chalk.red('●')} Broken:   ${broken.length}`);
  console.log(`  ${chalk.yellow('●')} Missing:  ${missing.length}`);
  console.log(`  ${chalk.magenta('●')} Stale:    ${stale.length}`);
  console.log(`  ${chalk.red('●')} Conflict: ${conflicts.length}`);

  // Show deprecated links
  if (deprecated.length > 0) {
    console.log(chalk.bold('\nDeprecated:'));
    for (const r of deprecated) {
      if (r.reason === 'format') {
        console.log(`  ${chalk.cyan('→')} ${r.slug} (${r.tool}): ${r.format} → skill`);
      } else {
        console.log(`  ${chalk.cyan('→')} ${r.slug} (${r.tool}): ${r.linkPath} → ${r.canonicalPath}`);
      }
    }
  }

  const issues = [...broken, ...missing, ...stale];
  const totalIssues = issues.length + deprecated.length;

  if (totalIssues === 0 && conflicts.length === 0) {
    console.log(chalk.green('\n✓ All symlinks healthy.'));
    if (!opts.dryRun) await updateLastSync();
    return;
  }

  // Show issues
  if (issues.length > 0) {
    console.log(chalk.bold('\nIssues:'));
    for (const r of issues) {
      console.log(`  ${healthIcon(r.status.health)} ${r.slug} (${r.tool}): ${r.status.detail}`);
    }
  }

  if (conflicts.length > 0) {
    console.log(chalk.bold('\nConflicts (manual resolution needed):'));
    for (const r of conflicts) {
      console.log(`  ${chalk.red('!')} ${r.slug} (${r.tool}): ${r.status.detail}`);
    }
  }

  // Repair
  if (opts.repair && !opts.dryRun) {
    // Migrate deprecated links (path changes + format upgrades)
    if (deprecated.length > 0) {
      console.log(chalk.bold('\nMigrating deprecated links...'));
      let migrated = 0;
      for (const r of deprecated) {
        try {
          if (r.reason === 'format') {
            // Undeploy old format, update meta, deploy as skill
            await undeploy(r.slug, r.tool as ToolName, r.format as DeployFormat);
            const meta = await readMeta(r.slug);
            meta.deployAs.codex = 'skill';
            await writeMeta(r.slug, meta);
            const result = await deploy(r.slug, 'codex', 'skill');
            if (result.action === 'deployed') {
              console.log(`  ${chalk.green('✓')} Migrated: ${r.slug} (${r.format} → skill)`);
              migrated++;
            } else {
              console.log(`  ${chalk.red('✗')} Could not migrate: ${r.slug} (${r.tool})`);
            }
          } else {
            const result = await deploy(r.slug, r.tool as ToolName, r.format as DeployFormat);
            if (result.action === 'deployed') {
              console.log(`  ${chalk.green('✓')} Migrated: ${r.slug} (${r.tool})`);
              migrated++;
            } else {
              console.log(`  ${chalk.red('✗')} Could not migrate: ${r.slug} (${r.tool})`);
            }
          }
        } catch (err) {
          console.log(`  ${chalk.red('✗')} Could not migrate: ${r.slug} (${r.tool}): ${err}`);
        }
      }
      console.log(chalk.green(`  Migrated ${migrated} of ${deprecated.length} links.`));
    }

    // Repair broken/missing/stale links
    if (issues.length > 0) {
      console.log(chalk.bold('\nRepairing...'));
      let repaired = 0;
      for (const r of issues) {
        const result = await repairLink(r.status.linkPath, r.status.expectedTarget);
        if (result.health === 'healthy') {
          console.log(`  ${chalk.green('✓')} Repaired: ${r.slug} (${r.tool})`);
          repaired++;
        } else {
          console.log(`  ${chalk.red('✗')} Could not repair: ${r.slug} (${r.tool}): ${result.detail}`);
        }
      }
      console.log(chalk.green(`\n✓ Repaired ${repaired} of ${issues.length} issues.`));
    }
  } else if (totalIssues > 0 && !opts.repair) {
    console.log(chalk.dim('\nRun `sm sync --repair` to fix issues.'));
  }

  if (opts.dryRun) {
    console.log(chalk.yellow('\n--dry-run: No changes made.'));
  }

  if (!opts.dryRun) await updateLastSync();
}

function healthIcon(health: string): string {
  switch (health) {
    case 'healthy':
      return chalk.green('✓');
    case 'broken':
      return chalk.red('✗');
    case 'missing':
      return chalk.yellow('?');
    case 'stale':
      return chalk.magenta('~');
    case 'conflict':
      return chalk.red('!');
    default:
      return ' ';
  }
}
