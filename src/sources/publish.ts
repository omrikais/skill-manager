import fs from 'fs-extra';
import path from 'path';
import { skillDir, skillFile, skillRefsDir } from '../fs/paths.js';
import { SkillNotFoundError, SmError } from '../utils/errors.js';

export interface PublishResult {
  slug: string;
  outPath: string;
  filesWritten: string[];
}

/**
 * Export a skill to a portable directory structure.
 * Copies SKILL.md and references/, but strips .sm-meta.json and .sm-history.json.
 */
export async function publishSkill(
  slug: string,
  outDir: string,
  overwrite?: boolean,
): Promise<PublishResult> {
  const srcDir = skillDir(slug);
  if (!(await fs.pathExists(srcDir))) {
    throw new SkillNotFoundError(slug);
  }

  const outPath = path.join(outDir, slug);

  const exists = await fs.pathExists(outPath);
  if (exists && !overwrite) {
    throw new SmError(
      `Target directory already exists: ${outPath}. Use --overwrite to replace.`,
      'PUBLISH_EXISTS',
    );
  }

  if (exists && overwrite) {
    await fs.remove(outPath);
  }
  await fs.ensureDir(outPath);

  const filesWritten: string[] = [];

  // Copy SKILL.md
  const srcSkill = skillFile(slug);
  if (await fs.pathExists(srcSkill)) {
    await fs.copy(srcSkill, path.join(outPath, 'SKILL.md'));
    filesWritten.push('SKILL.md');
  }

  // Copy references/ if exists
  const srcRefs = skillRefsDir(slug);
  if (await fs.pathExists(srcRefs)) {
    await fs.copy(srcRefs, path.join(outPath, 'references'));
    filesWritten.push('references/');
  }

  return { slug, outPath, filesWritten };
}
