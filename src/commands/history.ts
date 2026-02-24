import chalk from 'chalk';
import { skillExists } from '../core/skill.js';
import { loadHistory, rollbackToVersion } from '../core/versioning.js';
import { SkillNotFoundError } from '../utils/errors.js';

export async function historyCommand(name: string): Promise<void> {
  if (!(await skillExists(name))) {
    throw new SkillNotFoundError(name);
  }

  const history = await loadHistory(name);

  if (history.entries.length === 0) {
    console.log(chalk.dim(`\nNo version history for ${name}.\n`));
    return;
  }

  console.log(chalk.bold(`\nVersion history for ${name}\n`));
  console.log(
    chalk.dim('  Ver   Date                          Hash      Message')
  );

  for (const entry of history.entries) {
    const ver = `v${entry.version}`.padEnd(5);
    const date = entry.timestamp.slice(0, 19).replace('T', ' ');
    const hash = entry.hash.slice(0, 8);
    const msg = entry.message ?? '';
    const isCurrent = entry.version === history.current ? chalk.green(' ← current') : '';
    console.log(`  ${ver} ${date}  ${hash}  ${msg}${isCurrent}`);
  }

  console.log();
}

export async function rollbackCommand(name: string, version?: string): Promise<void> {
  if (!(await skillExists(name))) {
    throw new SkillNotFoundError(name);
  }

  let ver: number | undefined;
  if (version) {
    if (!/^\d+$/.test(version)) {
      throw new Error(`Invalid version number: ${version}`);
    }
    ver = Number(version);
    if (ver < 1) {
      throw new Error(`Invalid version number: ${version}`);
    }
  }

  const entry = await rollbackToVersion(name, ver);
  const target = entry.message?.match(/v(\d+)/)?.[1] ?? '?';
  console.log(chalk.green(`✓ Rolled back ${name} to v${target} (recorded as v${entry.version})`));
}
