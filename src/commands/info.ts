import path from 'path';
import chalk from 'chalk';
import { loadSkill, getSkillFiles } from '../core/skill.js';
import { getLinkRecords } from '../core/state.js';
import { validateLink } from '../fs/links.js';
import { loadHistory } from '../core/versioning.js';
import { buildDepGraph, getDirectDeps, getDependents } from '../core/deps.js';

export async function infoCommand(name: string): Promise<void> {
  const skill = await loadSkill(name);
  const links = await getLinkRecords(name);
  const files = await getSkillFiles(name);

  console.log(chalk.bold(`\n${skill.name}\n`));

  if (skill.description) {
    console.log(`  ${skill.description}\n`);
  }

  // Metadata
  console.log(chalk.bold('  Metadata'));
  console.log(`    Slug:     ${skill.slug}`);
  console.log(`    Format:   ${skill.meta.format}`);
  console.log(`    Tags:     ${skill.tags.join(', ') || chalk.dim('none')}`);
  console.log(`    Source:    ${skill.meta.source.type}${skill.meta.source.importedFrom ? ` (${skill.meta.source.importedFrom})` : ''}`);
  if (skill.meta.originalFormat) {
    console.log(`    Original: ${skill.meta.originalFormat}`);
  }
  if (skill.meta.createdAt) {
    console.log(`    Created:  ${skill.meta.createdAt}`);
  }
  if (skill.meta.lastDeployed) {
    console.log(`    Deployed: ${skill.meta.lastDeployed}`);
  }
  if (skill.meta.lastUsed) {
    console.log(`    Used:     ${skill.meta.lastUsed}`);
  }
  console.log(`    Uses:     ${skill.meta.usageCount ?? 0}`);
  try {
    const history = await loadHistory(name);
    if (history.entries.length > 0) {
      console.log(`    Version:  v${history.current} (${history.entries.length} versions total)`);
    }
  } catch {
    // Non-critical
  }

  // Deploy status
  console.log(chalk.bold('\n  Deployment'));
  console.log(`    CC deploy:    ${skill.meta.deployAs.cc}`);
  console.log(`    Codex deploy: ${skill.meta.deployAs.codex}`);

  // Dependencies
  try {
    const deps = await getDirectDeps(name);
    if (deps.length > 0) {
      console.log(chalk.bold('\n  Dependencies'));
      console.log(`    ${deps.join(', ')}`);
    }

    const graph = await buildDepGraph();
    const dependents = getDependents(name, graph);
    if (dependents.length > 0) {
      console.log(chalk.bold('\n  Depended on by'));
      console.log(`    ${dependents.join(', ')}`);
    }
  } catch {
    // Non-critical
  }

  if (links.length > 0) {
    console.log(chalk.bold('\n  Active Links'));
    for (const link of links) {
      const status = await validateLink(link.linkPath, link.targetPath);
      const health =
        status.health === 'healthy'
          ? chalk.green('●')
          : status.health === 'broken'
            ? chalk.red('●')
            : chalk.yellow('●');
      const scope = link.scope ?? 'user';
      const scopeLabel = scope === 'project'
        ? `project: ${path.basename(link.projectRoot ?? '')}`
        : 'user';
      console.log(`    ${health} ${link.tool} (${link.format}) [${scopeLabel}]: ${link.linkPath}`);
    }
  }

  // Files
  if (files.length > 0) {
    console.log(chalk.bold('\n  Files'));
    for (const f of files) {
      console.log(`    ${f}`);
    }
  }

  // Content preview
  const preview = skill.content.content.slice(0, 200);
  if (preview) {
    console.log(chalk.bold('\n  Content Preview'));
    console.log(`    ${chalk.dim(preview.replace(/\n/g, '\n    '))}${skill.content.content.length > 200 ? '…' : ''}`);
  }

  console.log();
}
