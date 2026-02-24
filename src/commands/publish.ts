import path from 'path';
import chalk from 'chalk';
import { publishSkill } from '../sources/publish.js';

export async function publishCommand(
  name: string,
  opts: { out: string; overwrite?: boolean },
): Promise<void> {
  const outDir = path.resolve(opts.out);
  const result = await publishSkill(name, outDir, opts.overwrite);

  console.log(chalk.green(`✓ Published ${name} to ${result.outPath}`));
  console.log(chalk.dim(`  Files: ${result.filesWritten.join(', ')}`));
  console.log(chalk.dim(`  To share: cd ${outDir} && git add ${name}/ && git commit`));
}
