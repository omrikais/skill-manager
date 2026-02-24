import chalk from 'chalk';
import { listSkills } from '../core/skill.js';
import { getLinkRecords } from '../core/state.js';

export async function searchCommand(query: string): Promise<void> {
  const skills = await listSkills();
  const q = query.toLowerCase();

  const matches = skills.filter((skill) => {
    if (skill.slug.includes(q)) return true;
    if (skill.name.toLowerCase().includes(q)) return true;
    if (skill.description.toLowerCase().includes(q)) return true;
    if (skill.tags.some((t) => t.toLowerCase().includes(q))) return true;
    if (skill.content.content.toLowerCase().includes(q)) return true;
    return false;
  });

  if (matches.length === 0) {
    console.log(chalk.yellow(`No skills matching "${query}".`));
    return;
  }

  const links = await getLinkRecords();

  console.log(chalk.bold(`\nFound ${matches.length} skill(s) matching "${query}":\n`));

  for (const skill of matches) {
    const skillLinks = links.filter((l) => l.slug === skill.slug);
    const deployed = skillLinks.map((l) => l.tool).join(', ') || chalk.dim('not deployed');
    const tags = skill.tags.length > 0 ? chalk.dim(` [${skill.tags.join(', ')}]`) : '';

    console.log(`  ${chalk.green(skill.slug)}${tags}`);
    if (skill.description) {
      console.log(`    ${skill.description}`);
    }
    console.log(`    Deployed: ${deployed}`);
    console.log();
  }
}
