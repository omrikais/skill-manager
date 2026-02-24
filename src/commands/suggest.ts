import chalk from 'chalk';
import { scanProjectSignals, matchSkillTriggers } from '../core/triggers.js';
import { addCommand } from './add.js';

interface SuggestOptions {
  apply?: boolean;
  json?: boolean;
}

export async function suggestCommand(opts: SuggestOptions): Promise<void> {
  const projectRoot = process.cwd();
  const signals = await scanProjectSignals(projectRoot);

  if (signals.files.length === 0 && signals.dirs.length === 0) {
    if (opts.json) {
      console.log('[]');
    } else {
      console.log(chalk.dim('No project files detected in current directory.'));
    }
    return;
  }

  const suggestions = await matchSkillTriggers(signals, undefined, projectRoot);

  if (opts.json) {
    console.log(JSON.stringify(suggestions, null, 2));
    return;
  }

  if (suggestions.length === 0) {
    console.log(chalk.dim('\nNo skill suggestions for this project.\n'));
    return;
  }

  console.log(chalk.bold('\nSkill suggestions for this project\n'));

  const confColors = {
    high: chalk.green,
    medium: chalk.yellow,
    low: chalk.dim,
  };

  for (const s of suggestions) {
    const conf = confColors[s.confidence](`[${s.confidence}]`);
    const deployed = s.isDeployed ? chalk.dim(' (deployed)') : '';
    console.log(`  ${conf} ${chalk.bold(s.name)}${deployed}`);
    if (s.description) {
      console.log(`       ${chalk.dim(s.description)}`);
    }
    console.log(`       Matched: ${s.matchedTriggers.join(', ')}`);
    if (s.depends.length > 0) {
      console.log(`       Depends: ${s.depends.join(', ')}`);
    }
  }

  if (opts.apply) {
    console.log(chalk.bold('\nAuto-deploying suggestions...'));
    let deployed = 0;
    for (const s of suggestions) {
      if (s.isDeployed) continue;
      try {
        deployed += await addCommand(s.slug, { all: true });
      } catch (err) {
        console.log(chalk.yellow(`  ⚠ Could not deploy ${s.name}: ${err instanceof Error ? err.message : err}`));
      }
    }
    if (deployed === 0) {
      console.log(chalk.dim('  No new skills to deploy.'));
    }
  }

  console.log();
}
