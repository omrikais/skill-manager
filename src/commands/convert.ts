import chalk from 'chalk';
import { skillExists } from '../core/skill.js';
import { readMeta, writeMeta } from '../core/meta.js';
import { SkillNotFoundError } from '../utils/errors.js';

export async function convertCommand(name: string): Promise<void> {
  if (!(await skillExists(name))) {
    throw new SkillNotFoundError(name);
  }

  const meta = await readMeta(name);

  if (meta.format === 'skill' && meta.deployAs.cc === 'skill' && meta.deployAs.codex === 'skill') {
    console.log(chalk.yellow(`${name} is already in skill format.`));
    return;
  }

  // Update deploy format to skill
  meta.deployAs.cc = meta.deployAs.cc !== 'none' ? 'skill' : 'none';
  meta.deployAs.codex = meta.deployAs.codex !== 'none' ? 'skill' : 'none';
  meta.format = 'skill';
  meta.updatedAt = new Date().toISOString();

  await writeMeta(name, meta);

  console.log(chalk.green(`✓ Converted ${name} to skill format.`));
  console.log(chalk.dim('  Run `sm sync` to update symlinks.'));
}
