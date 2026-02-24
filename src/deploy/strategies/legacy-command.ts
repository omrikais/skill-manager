import path from 'path';
import { createLink, removeLink } from '../../fs/links.js';
import { skillFile, CC_COMMANDS_DIR } from '../../fs/paths.js';

/**
 * Deploy as a legacy flat command file for Claude Code.
 * Symlinks the SKILL.md file as <slug>.md in ~/.claude/commands/
 */
export async function deployLegacyCommand(
  slug: string,
): Promise<{ linkPath: string; targetPath: string }> {
  const target = skillFile(slug);
  const linkPath = path.join(CC_COMMANDS_DIR, `${slug}.md`);

  await createLink(target, linkPath);

  return { linkPath, targetPath: target };
}

export async function undeployLegacyCommand(slug: string): Promise<boolean> {
  const linkPath = path.join(CC_COMMANDS_DIR, `${slug}.md`);
  return removeLink(linkPath);
}
