import chalk from 'chalk';
import { loadManifest, resolveActiveSkills } from '../core/manifest.js';
import { skillExists } from '../core/skill.js';
import { deploy, deployToProject } from '../deploy/engine.js';
import { UsageError } from '../utils/errors.js';

interface InstallOptions {
  profile?: string;
}

export async function installCommand(opts: InstallOptions): Promise<void> {
  const projectRoot = process.cwd();

  const manifest = await loadManifest(projectRoot);

  if (opts.profile) {
    if (!manifest.profiles[opts.profile]) {
      throw new UsageError(`Unknown profile: "${opts.profile}". Available profiles: ${Object.keys(manifest.profiles).join(', ') || '(none)'}`);
    }
    manifest.activeProfile = opts.profile;
  }

  const skills = resolveActiveSkills(manifest);

  if (skills.length === 0) {
    console.log(chalk.yellow('No skills to install.'));
    return;
  }

  console.log(chalk.bold(`\nInstalling ${skills.length} skills...\n`));

  let deployed = 0;
  let skipped = 0;

  for (const skill of skills) {
    if (!(await skillExists(skill.name))) {
      console.log(chalk.yellow(`  ⚠ Skill not found in store: ${skill.name}`));
      skipped++;
      continue;
    }

    for (const tool of skill.tools) {
      if (skill.scope === 'project') {
        const result = await deployToProject(skill.name, tool, projectRoot);
        if (result.action === 'deployed') {
          console.log(chalk.green(`  ✓ ${skill.name} → project ${tool}`));
          deployed++;
        }
      } else {
        const result = await deploy(skill.name, tool);
        if (result.action === 'deployed') {
          console.log(chalk.green(`  ✓ ${skill.name} → user ${tool}`));
          deployed++;
        }
      }
    }
  }

  console.log(chalk.bold.green(`\n✓ Installed: ${deployed} deployments, ${skipped} skipped.\n`));
}
