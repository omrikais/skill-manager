import fs from 'fs-extra';
import path from 'path';
import { skillDir, skillFile, SM_SKILLS_DIR, type ToolName } from '../fs/paths.js';
import { parseSkillContent, type ParsedSkillContent } from './frontmatter.js';
import { readMeta, type SkillMeta } from './meta.js';
import { getLinkRecords, loadState, saveState } from './state.js';
import { undeploy, undeployProject } from '../deploy/engine.js';
import { SkillNotFoundError } from '../utils/errors.js';

export interface Skill {
  slug: string;
  name: string;
  description: string;
  tags: string[];
  content: ParsedSkillContent;
  meta: SkillMeta;
}

export async function loadSkill(slug: string): Promise<Skill> {
  const dir = skillDir(slug);
  if (!(await fs.pathExists(dir))) {
    throw new SkillNotFoundError(slug);
  }

  const mdPath = skillFile(slug);
  const raw = await fs.readFile(mdPath, 'utf-8');
  const content = parseSkillContent(raw);
  const meta = await readMeta(slug);

  return {
    slug,
    name: content.frontmatter.name ?? slug,
    description: content.frontmatter.description ?? '',
    tags: [...new Set([...(content.frontmatter.tags ?? []), ...(meta.tags ?? [])])],
    content,
    meta,
  };
}

export async function listSlugs(): Promise<string[]> {
  if (!(await fs.pathExists(SM_SKILLS_DIR))) {
    return [];
  }

  const entries = await fs.readdir(SM_SKILLS_DIR, { withFileTypes: true });
  const slugs: string[] = [];

  for (const entry of entries) {
    if (entry.isDirectory() || entry.isSymbolicLink()) {
      const mdPath = skillFile(entry.name);
      if (await fs.pathExists(mdPath)) {
        slugs.push(entry.name);
      }
    }
  }

  return slugs.sort();
}

export async function listSkills(): Promise<Skill[]> {
  const slugs = await listSlugs();
  const skills: Skill[] = [];
  for (const slug of slugs) {
    try {
      skills.push(await loadSkill(slug));
    } catch {
      // Skip invalid skills
    }
  }
  return skills;
}

export async function skillExists(slug: string): Promise<boolean> {
  return fs.pathExists(skillDir(slug));
}

export { slugify } from '../utils/slug.js';

/**
 * Fully delete a skill: undeploy from all tools/scopes, remove state records,
 * and delete the canonical skill directory.
 */
export async function deleteSkill(slug: string): Promise<void> {
  if (!(await skillExists(slug))) {
    throw new SkillNotFoundError(slug);
  }

  // 1. Undeploy from all tools/scopes by reading existing link records
  const allLinks = await getLinkRecords(slug);
  for (const link of allLinks) {
    const scope = link.scope ?? 'user';
    try {
      if (scope === 'project' && link.projectRoot) {
        await undeployProject(slug, link.tool as ToolName, link.projectRoot);
      } else {
        await undeploy(slug, link.tool as ToolName);
      }
    } catch {
      // Best-effort: continue even if undeploy fails (e.g. symlink already
      // gone, or permissions issue).  Step 2 purges state records and step 3
      // deletes the canonical dir, so any leftover symlink becomes broken
      // (harmless — tools ignore broken symlinks, `sm doctor` reports them).
      // Aborting here would leave the skill in a partially-deleted state
      // that is harder to recover from than a stale broken symlink.
    }
  }

  // 2. Purge any remaining link records — undeploy() skips state cleanup
  //    when the symlink is already missing, so sweep up stale records here.
  const state = await loadState();
  const before = state.links.length;
  state.links = state.links.filter((l) => l.slug !== slug);
  if (state.links.length !== before) {
    await saveState(state);
  }

  // 3. Remove canonical skill directory
  const dir = skillDir(slug);
  await fs.remove(dir);
}

export async function getSkillFiles(slug: string): Promise<string[]> {
  const dir = skillDir(slug);
  if (!(await fs.pathExists(dir))) return [];

  const files: string[] = [];
  const walk = async (d: string) => {
    const entries = await fs.readdir(d, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else {
        files.push(path.relative(dir, full));
      }
    }
  };
  await walk(dir);
  return files.sort();
}
