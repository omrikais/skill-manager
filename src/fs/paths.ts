import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';

const HOME = process.env.SM_TEST_HOME ?? os.homedir();

export const SM_HOME = process.env.SM_HOME ?? path.join(HOME, '.skill-manager');
export const SM_SKILLS_DIR = path.join(SM_HOME, 'skills');
export const SM_PROFILES_DIR = path.join(SM_HOME, 'profiles');
export const SM_SOURCES_DIR = path.join(SM_HOME, 'sources');
export const SM_BACKUPS_DIR = path.join(SM_HOME, 'backups');
export const SM_LOGS_DIR = path.join(SM_HOME, 'logs');
export const SM_CONFIG_FILE = path.join(SM_HOME, 'config.toml');
export const SM_STATE_FILE = path.join(SM_HOME, 'state.json');
export const SM_SOURCES_REGISTRY = path.join(SM_HOME, 'sources.json');

// Bundled packs directory (relative to compiled output)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const SM_PACKS_DIR = path.resolve(__dirname, '../../packs');

// Claude Code paths
export const CC_HOME = path.join(HOME, '.claude');
export const CC_COMMANDS_DIR = path.join(CC_HOME, 'commands');
export const CC_SKILLS_DIR = path.join(CC_HOME, 'skills');

// Codex paths
export const CODEX_HOME = path.join(HOME, '.codex');
export const CODEX_PROMPTS_DIR = path.join(CODEX_HOME, 'prompts');
export const CODEX_SKILLS_DIR = path.join(HOME, '.agents', 'skills');

// Legacy Codex skills path (deprecated, scan-only)
export const CODEX_LEGACY_SKILLS_DIR = path.join(CODEX_HOME, 'skills');

// Per-skill paths
export function skillDir(slug: string): string {
  return path.join(SM_SKILLS_DIR, slug);
}

export function skillFile(slug: string): string {
  return path.join(SM_SKILLS_DIR, slug, 'SKILL.md');
}

export function skillMetaFile(slug: string): string {
  return path.join(SM_SKILLS_DIR, slug, '.sm-meta.json');
}

export function skillRefsDir(slug: string): string {
  return path.join(SM_SKILLS_DIR, slug, 'references');
}

export function skillHistoryFile(slug: string): string {
  return path.join(SM_SKILLS_DIR, slug, '.sm-history.json');
}

export function sourceRepoDir(name: string): string {
  return path.join(SM_SOURCES_DIR, name);
}

// Project-level paths
export function projectCCSkillsDir(projectRoot: string): string {
  return path.join(projectRoot, '.claude', 'skills');
}

export function projectCodexSkillsDir(projectRoot: string): string {
  return path.join(projectRoot, '.agents', 'skills');
}

export function projectManifestFile(projectRoot: string): string {
  return path.join(projectRoot, '.skills.json');
}

// Profile path
export function profileFile(name: string): string {
  return path.join(SM_PROFILES_DIR, `${name}.json`);
}

// Backup path
export function backupDir(timestamp: string): string {
  return path.join(SM_BACKUPS_DIR, timestamp);
}

// Tool names
export type ToolName = 'cc' | 'codex';

// Deploy scope
export type DeployScope = 'user' | 'project';

export const ALL_TOOLS: ToolName[] = ['cc', 'codex'];

// Deploy format
export type DeployFormat = 'skill' | 'legacy-command' | 'legacy-prompt' | 'none';

// Resolve the target directory for a given tool and deploy format
export function deployTargetDir(tool: ToolName, format: DeployFormat): string | null {
  switch (format) {
    case 'skill':
      return tool === 'cc' ? CC_SKILLS_DIR : CODEX_SKILLS_DIR;
    case 'legacy-command':
      return tool === 'cc' ? CC_COMMANDS_DIR : null;
    case 'legacy-prompt':
      return tool === 'codex' ? CODEX_PROMPTS_DIR : null;
    case 'none':
      return null;
  }
}

// Resolve the full link path for a deployed skill
export function deployLinkPath(tool: ToolName, format: DeployFormat, slug: string): string | null {
  const dir = deployTargetDir(tool, format);
  if (!dir) return null;

  if (format === 'skill') {
    return path.join(dir, slug);
  }
  // Legacy formats use flat files
  return path.join(dir, `${slug}.md`);
}

/**
 * Resolve a project root to its canonical (real) path so that symlinked
 * directories always produce the same state key.
 */
export function resolveProjectRoot(projectRoot: string): string {
  try {
    return fs.realpathSync(projectRoot);
  } catch {
    // If the path doesn't exist yet, normalize what we can
    return path.resolve(projectRoot);
  }
}

// Project-level deploy target directory
export function projectDeployTargetDir(tool: ToolName, projectRoot: string): string {
  return tool === 'cc'
    ? projectCCSkillsDir(projectRoot)
    : projectCodexSkillsDir(projectRoot);
}

// Project-level deploy link path
export function projectDeployLinkPath(tool: ToolName, slug: string, projectRoot: string): string {
  return path.join(projectDeployTargetDir(tool, projectRoot), slug);
}

// Detect project context (informational only — does NOT gate deployment)
export function detectProjectContext(cwd: string): {
  hasClaudeDir: boolean;
  hasCodexDir: boolean;
  projectRoot: string;
} {
  const hasClaudeDir = fs.existsSync(path.join(cwd, '.claude'));
  const hasCodexDir = fs.existsSync(path.join(cwd, '.codex')) || fs.existsSync(path.join(cwd, '.agents'));
  return { hasClaudeDir, hasCodexDir, projectRoot: cwd };
}
