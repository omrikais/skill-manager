import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'node:url';
import chalk from 'chalk';
import { skillDir, skillFile, SM_SKILLS_DIR } from '../fs/paths.js';
import { createMeta, writeMeta } from '../core/meta.js';
import { slugify, skillExists } from '../core/skill.js';
import { SkillExistsError } from '../utils/errors.js';
import { recordVersion } from '../core/versioning.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface CreateOptions {
  template?: string;
}

export async function createCommand(name: string, opts: CreateOptions): Promise<void> {
  const slug = slugify(name);

  if (await skillExists(slug)) {
    throw new SkillExistsError(slug);
  }

  await fs.ensureDir(SM_SKILLS_DIR);
  const dir = skillDir(slug);
  await fs.ensureDir(dir);

  // Read template
  const templateName = opts.template ?? 'basic';
  const templatePath = path.join(
    __dirname,
    '../../templates',
    `skill-${templateName}.md`
  );

  let content: string;
  if (await fs.pathExists(templatePath)) {
    content = await fs.readFile(templatePath, 'utf-8');
    content = content.replace(/\{\{name\}\}/g, name);
  } else {
    content = `---\nname: "${name}"\ndescription: ""\ntags: []\n---\n\n# ${name}\n\nDescribe this skill.\n`;
  }

  await fs.writeFile(skillFile(slug), content, 'utf-8');

  const meta = createMeta({
    source: { type: 'created' },
    deployAs: { cc: 'skill', codex: 'skill' },
  });
  await writeMeta(slug, meta);

  try {
    await recordVersion(slug, 'initial');
  } catch {
    // Non-critical
  }

  console.log(chalk.green(`✓ Created skill: ${slug}`));
  console.log(chalk.dim(`  ${skillFile(slug)}`));
  console.log(chalk.dim(`  Run \`sm edit ${slug}\` to edit, or \`sm add ${slug}\` to deploy.`));
}
