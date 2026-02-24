import chalk from 'chalk';
import {
  listProfiles,
  loadProfile,
  saveProfile,
  deleteProfile,
  profileExists,
  type Profile,
} from '../core/profile.js';
import { listSlugs } from '../core/skill.js';
import { deploy } from '../deploy/engine.js';
import { UsageError } from '../utils/errors.js';

export async function profileCommand(
  action: string,
  name?: string,
): Promise<void> {
  switch (action) {
    case 'list':
      return profileListAction();
    case 'create':
      if (!name) throw new UsageError('Profile name required');
      return profileCreateAction(name);
    case 'apply':
      if (!name) throw new UsageError('Profile name required');
      return profileApplyAction(name);
    case 'delete':
      if (!name) throw new UsageError('Profile name required');
      return profileDeleteAction(name);
    default:
      console.log(chalk.yellow(`Unknown action: ${action}. Use list, create, apply, or delete.`));
  }
}

async function profileListAction(): Promise<void> {
  const profiles = await listProfiles();

  if (profiles.length === 0) {
    console.log(chalk.yellow('No profiles found.'));
    return;
  }

  console.log(chalk.bold(`\nProfiles (${profiles.length}):\n`));
  for (const p of profiles) {
    console.log(`  ${chalk.green(p.name)} — ${p.skills.length} skills`);
    if (p.description) {
      console.log(`    ${chalk.dim(p.description)}`);
    }
  }
  console.log();
}

async function profileCreateAction(name: string): Promise<void> {
  if (await profileExists(name)) {
    console.log(chalk.yellow(`Profile "${name}" already exists.`));
    return;
  }

  // Create with all currently available skills
  const slugs = await listSlugs();

  const profile: Profile = {
    name,
    skills: slugs.map((s) => ({ name: s, tools: ['cc', 'codex'] as ('cc' | 'codex')[] })),
    createdAt: new Date().toISOString(),
  };

  await saveProfile(profile);
  console.log(chalk.green(`✓ Created profile "${name}" with ${slugs.length} skills.`));
}

async function profileApplyAction(name: string): Promise<void> {
  const profile = await loadProfile(name);

  console.log(chalk.bold(`\nApplying profile "${name}"...\n`));

  let deployed = 0;
  for (const skill of profile.skills) {
    for (const tool of skill.tools) {
      try {
        const result = await deploy(skill.name, tool);
        if (result.action === 'deployed') {
          console.log(chalk.green(`  ✓ ${skill.name} → ${tool}`));
          deployed++;
        }
      } catch (err) {
        console.log(chalk.yellow(`  ⚠ ${skill.name}: ${err}`));
      }
    }
  }

  console.log(chalk.bold.green(`\n✓ Applied: ${deployed} deployments.\n`));
}

async function profileDeleteAction(name: string): Promise<void> {
  if (!(await profileExists(name))) {
    console.log(chalk.yellow(`Profile "${name}" not found.`));
    return;
  }

  await deleteProfile(name);
  console.log(chalk.green(`✓ Deleted profile "${name}".`));
}
