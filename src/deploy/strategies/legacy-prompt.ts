import path from 'path';
import { createLink, removeLink } from '../../fs/links.js';
import { skillFile, CODEX_PROMPTS_DIR } from '../../fs/paths.js';

/**
 * Deploy as a legacy flat prompt file for Codex CLI.
 * Symlinks the SKILL.md file as <slug>.md in ~/.codex/prompts/
 */
export async function deployLegacyPrompt(
  slug: string,
): Promise<{ linkPath: string; targetPath: string }> {
  const target = skillFile(slug);
  const linkPath = path.join(CODEX_PROMPTS_DIR, `${slug}.md`);

  await createLink(target, linkPath);

  return { linkPath, targetPath: target };
}

export async function undeployLegacyPrompt(slug: string): Promise<boolean> {
  const linkPath = path.join(CODEX_PROMPTS_DIR, `${slug}.md`);
  return removeLink(linkPath);
}
