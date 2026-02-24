import chalk from 'chalk';
import { listSlugs } from '../core/skill.js';
import { readMeta } from '../core/meta.js';
import { getUsageStats, findUnusedSkills, type SkillMetaEntry } from '../core/analytics.js';
import { formatTable, type Column } from '../utils/table.js';

interface AnalyticsOptions {
  json?: boolean;
}

export async function analyticsCommand(opts: AnalyticsOptions): Promise<void> {
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

  const stats = getUsageStats(metas);

  if (opts.json) {
    process.stdout.write(JSON.stringify(stats, null, 2) + '\n');
    return;
  }

  console.log(chalk.bold('\nSkill Usage Analytics\n'));

  if (stats.length === 0) {
    console.log(chalk.dim('  No skills found.'));
    console.log();
    return;
  }

  const columns: Column[] = [
    { header: 'Skill', key: 'slug', width: 30 },
    { header: 'Uses', key: 'usageCount', width: 6, align: 'right' },
    {
      header: 'Last Used',
      key: 'lastUsed',
      width: 12,
      format: (v) => v ? formatDate(v as string) : chalk.dim('never'),
    },
    {
      header: 'Last Deployed',
      key: 'lastDeployed',
      width: 14,
      format: (v) => v ? formatDate(v as string) : chalk.dim('never'),
    },
  ];

  const rows = stats.map((s) => ({ ...s }));
  console.log(formatTable(rows, columns));

  // Show unused skills section
  const unused = findUnusedSkills(metas, 30);
  if (unused.length > 0) {
    console.log(chalk.bold('\n  Unused skills (not used in 30+ days)'));
    for (const slug of unused) {
      console.log(chalk.yellow(`    ${slug}`));
    }
  }

  console.log();
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}
