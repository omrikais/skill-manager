import chalk from 'chalk';
import { listSkills } from '../core/skill.js';
import { getLinkRecords } from '../core/state.js';
import { formatTable, type Column } from '../utils/table.js';
import { resolveProjectRoot } from '../fs/paths.js';

interface ListOptions {
  cc?: boolean;
  codex?: boolean;
  status?: boolean;
  project?: boolean;
}

export async function listCommand(opts: ListOptions): Promise<void> {
  const skills = await listSkills();

  if (skills.length === 0) {
    console.log(chalk.yellow('No skills found. Run `sm import` to import existing skills.'));
    return;
  }

  const projectRoot = resolveProjectRoot(process.cwd());
  const allLinks = await getLinkRecords();

  // Determine which links to use for the CC/Codex indicators
  const isProject = !!opts.project;
  // Filter links for display based on scope
  const displayLinks = allLinks.filter((l) => {
    const linkScope = l.scope ?? 'user';
    if (isProject) return linkScope === 'project' && l.projectRoot === projectRoot;
    return linkScope === 'user';
  });

  const rows = skills
    .filter((skill) => {
      const skillLinks = displayLinks.filter((l) => l.slug === skill.slug);
      if (isProject && skillLinks.length === 0) return false;
      if (!opts.cc && !opts.codex) return isProject ? skillLinks.length > 0 : true;
      if (opts.cc && skillLinks.some((l) => l.tool === 'cc')) return true;
      if (opts.codex && skillLinks.some((l) => l.tool === 'codex')) return true;
      return false;
    })
    .map((skill) => {
      const skillLinks = displayLinks.filter((l) => l.slug === skill.slug);
      const ccLink = skillLinks.find((l) => l.tool === 'cc');
      const codexLink = skillLinks.find((l) => l.tool === 'codex');

      return {
        name: skill.slug,
        cc: ccLink ? chalk.green('●') : chalk.dim('○'),
        codex: codexLink ? chalk.green('●') : chalk.dim('○'),
        format: skill.meta.format,
        tags: skill.tags.slice(0, 3).join(', '),
        description: truncate(skill.description, 40),
      };
    });

  const columns: Column[] = [
    { header: 'Name', key: 'name', width: 30 },
    { header: 'CC', key: 'cc', width: 4 },
    { header: 'Codex', key: 'codex', width: 6 },
  ];

  if (opts.status) {
    columns.push({ header: 'Format', key: 'format', width: 16 });
    columns.push({ header: 'Tags', key: 'tags', width: 20 });
  }

  columns.push({ header: 'Description', key: 'description' });

  const heading = isProject ? 'Project Skills' : 'Skills';
  console.log(chalk.bold(`\n${heading} (${rows.length})\n`));
  console.log(formatTable(rows, columns));
  console.log();
}

function truncate(str: string, len: number): string {
  if (str.length <= len) return str;
  return str.slice(0, len - 1) + '…';
}
