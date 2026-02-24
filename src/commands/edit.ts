import { execFileSync } from 'node:child_process';
import chalk from 'chalk';
import { skillFile } from '../fs/paths.js';
import { skillExists } from '../core/skill.js';
import { getEditor, parseEditorCommand } from '../utils/platform.js';
import { SkillNotFoundError } from '../utils/errors.js';
import { recordVersion } from '../core/versioning.js';

export async function editCommand(name: string): Promise<void> {
  if (!(await skillExists(name))) {
    throw new SkillNotFoundError(name);
  }

  const editor = getEditor();
  const file = skillFile(name);
  const [cmd, ...args] = parseEditorCommand(editor);

  console.log(chalk.dim(`Opening ${file} in ${editor}...`));
  execFileSync(cmd, [...args, file], { stdio: 'inherit', shell: process.platform === 'win32' });

  try {
    await recordVersion(name, 'edited');
  } catch {
    // Non-critical
  }
}
