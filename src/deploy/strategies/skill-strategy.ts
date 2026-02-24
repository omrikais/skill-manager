import path from 'path';
import { createLink, removeLink } from '../../fs/links.js';
import { skillDir, type ToolName } from '../../fs/paths.js';

/**
 * Deploy as a directory symlink (new skill format).
 * Links the whole skill directory into the tool's skills dir.
 */
export async function deploySkill(
  slug: string,
  tool: ToolName,
  targetDir: string,
): Promise<{ linkPath: string; targetPath: string }> {
  const target = skillDir(slug);
  const linkPath = path.join(targetDir, slug);

  await createLink(target, linkPath);

  return { linkPath, targetPath: target };
}

export async function undeploySkill(
  slug: string,
  targetDir: string,
): Promise<boolean> {
  const linkPath = path.join(targetDir, slug);
  return removeLink(linkPath);
}
