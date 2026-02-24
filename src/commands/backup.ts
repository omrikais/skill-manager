import chalk from 'chalk';
import {
  CC_COMMANDS_DIR,
  CC_SKILLS_DIR,
  CODEX_PROMPTS_DIR,
  CODEX_SKILLS_DIR,
  CODEX_LEGACY_SKILLS_DIR,
  SM_SKILLS_DIR,
} from '../fs/paths.js';
import { createBackup, listBackups, restoreBackup } from '../fs/backup.js';

export async function backupCommand(): Promise<void> {
  console.log(chalk.bold('\nCreating backup...\n'));

  const info = await createBackup([
    { label: 'sm-skills', path: SM_SKILLS_DIR },
    { label: 'cc-commands', path: CC_COMMANDS_DIR },
    { label: 'cc-skills', path: CC_SKILLS_DIR },
    { label: 'codex-prompts', path: CODEX_PROMPTS_DIR },
    { label: 'codex-skills', path: CODEX_SKILLS_DIR },
    { label: 'codex-legacy-skills', path: CODEX_LEGACY_SKILLS_DIR },
  ]);

  console.log(chalk.green(`✓ Backup created: ${info.id}`));
  console.log(chalk.dim(`  ${info.fileCount} files backed up to ${info.path}`));
}

export async function restoreCommand(id: string): Promise<void> {
  console.log(chalk.bold(`\nRestoring backup ${id}...\n`));

  const result = await restoreBackup(id, {
    'sm-skills': SM_SKILLS_DIR,
    'cc-commands': CC_COMMANDS_DIR,
    'cc-skills': CC_SKILLS_DIR,
    'codex-prompts': CODEX_PROMPTS_DIR,
    'codex-skills': CODEX_SKILLS_DIR,
  });

  if (result.errors.length > 0) {
    for (const err of result.errors) {
      console.log(chalk.yellow(`  ⚠ ${err}`));
    }
  }

  console.log(chalk.green(`✓ Restored ${result.restored} files.`));
}

export async function backupListCommand(): Promise<void> {
  const backups = await listBackups();

  if (backups.length === 0) {
    console.log(chalk.yellow('No backups found.'));
    return;
  }

  console.log(chalk.bold(`\nBackups (${backups.length}):\n`));
  for (const b of backups) {
    console.log(`  ${chalk.green(b.id)} — ${b.fileCount} files (${b.sources.join(', ')})`);
  }
  console.log();
}
