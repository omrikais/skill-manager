import path from 'path';
import { readMeta, writeMeta, type DeployAs } from '../core/meta.js';
import { recordVersion } from '../core/versioning.js';
import { addLinkRecord, removeLinkRecord, getLinkRecords, type LinkRecord } from '../core/state.js';
import {
  type ToolName,
  type DeployFormat,
  type DeployScope,
  CC_SKILLS_DIR,
  CODEX_SKILLS_DIR,
  deployLinkPath,
  projectDeployTargetDir,
  resolveProjectRoot,
} from '../fs/paths.js';
import { deploySkill, undeploySkill } from './strategies/skill-strategy.js';
import { deployLegacyCommand, undeployLegacyCommand } from './strategies/legacy-command.js';
import { deployLegacyPrompt, undeployLegacyPrompt } from './strategies/legacy-prompt.js';

export interface DeployResult {
  slug: string;
  tool: ToolName;
  format: DeployFormat;
  scope: DeployScope;
  projectRoot?: string;
  linkPath: string;
  targetPath: string;
  action: 'deployed' | 'undeployed' | 'skipped';
}

/**
 * Deploy a skill to the specified tool using its configured deploy format.
 */
export async function deploy(
  slug: string,
  tool: ToolName,
  formatOverride?: DeployFormat,
): Promise<DeployResult> {
  const meta = await readMeta(slug);
  const format = formatOverride ?? getFormat(meta.deployAs, tool);

  if (format === 'none') {
    return { slug, tool, format, scope: 'user', linkPath: '', targetPath: '', action: 'skipped' };
  }

  // Clean up old link if it exists at a different path (e.g. ~/.codex/skills/ → ~/.agents/skills/ migration)
  const existingRecords = await getLinkRecords(slug, { scope: 'user' });
  const existingRecord = existingRecords.find((r) => r.tool === tool);
  if (existingRecord) {
    const newLinkPath = deployLinkPath(tool, format, slug);
    if (newLinkPath && existingRecord.linkPath !== newLinkPath) {
      try {
        switch (existingRecord.format) {
          case 'skill':
            await undeploySkill(slug, path.dirname(existingRecord.linkPath));
            break;
          case 'legacy-command':
            await undeployLegacyCommand(slug);
            break;
          case 'legacy-prompt':
            await undeployLegacyPrompt(slug);
            break;
        }
      } catch {
        // Non-critical: old link may already be gone
      }
    }
  }

  // Record version snapshot before deploy
  try {
    await recordVersion(slug);
  } catch {
    // Non-critical: deploy proceeds even if versioning fails
  }

  let result: { linkPath: string; targetPath: string };

  switch (format) {
    case 'skill': {
      const targetDir = tool === 'cc' ? CC_SKILLS_DIR : CODEX_SKILLS_DIR;
      result = await deploySkill(slug, tool, targetDir);
      break;
    }
    case 'legacy-command':
      result = await deployLegacyCommand(slug);
      break;
    case 'legacy-prompt':
      result = await deployLegacyPrompt(slug);
      break;
    default:
      return { slug, tool, format, scope: 'user', linkPath: '', targetPath: '', action: 'skipped' };
  }

  // Record in state
  const now = new Date().toISOString();
  const record: LinkRecord = {
    slug,
    tool,
    format,
    linkPath: result.linkPath,
    targetPath: result.targetPath,
    createdAt: now,
  };
  await addLinkRecord(record);

  // Update lastDeployed timestamp in meta
  try {
    const updatedMeta = await readMeta(slug);
    updatedMeta.updatedAt = now;
    updatedMeta.lastDeployed = now;
    await writeMeta(slug, updatedMeta);
  } catch {
    // Non-critical: deploy succeeded even if meta update fails
  }

  return { ...result, slug, tool, format, scope: 'user', action: 'deployed' };
}

/**
 * Undeploy a skill from the specified tool.
 */
export async function undeploy(
  slug: string,
  tool: ToolName,
  formatOverride?: DeployFormat,
): Promise<DeployResult> {
  const meta = await readMeta(slug);

  // Look up the actual recorded link from state first — its format takes priority
  // over meta.deployAs, which may have drifted (e.g. set to 'none' after deploy).
  const existingRecords = await getLinkRecords(slug, { scope: 'user' });
  const existingRecord = existingRecords.find((r) => r.tool === tool);
  const format = formatOverride ?? existingRecord?.format ?? getFormat(meta.deployAs, tool);

  if (format === 'none') {
    return { slug, tool, format, scope: 'user', linkPath: '', targetPath: '', action: 'skipped' };
  }

  const linkPath = existingRecord?.linkPath ?? deployLinkPath(tool, format, slug);
  if (!linkPath) {
    return { slug, tool, format, scope: 'user', linkPath: '', targetPath: '', action: 'skipped' };
  }

  let removed = false;
  switch (format) {
    case 'skill': {
      // Use directory from recorded link path if available, otherwise compute from constants
      const targetDir = existingRecord
        ? path.dirname(existingRecord.linkPath)
        : (tool === 'cc' ? CC_SKILLS_DIR : CODEX_SKILLS_DIR);
      removed = await undeploySkill(slug, targetDir);
      break;
    }
    case 'legacy-command':
      removed = await undeployLegacyCommand(slug);
      break;
    case 'legacy-prompt':
      removed = await undeployLegacyPrompt(slug);
      break;
  }

  if (removed) {
    await removeLinkRecord(slug, tool);
  }

  return {
    slug,
    tool,
    format,
    scope: 'user',
    linkPath,
    targetPath: '',
    action: removed ? 'undeployed' : 'skipped',
  };
}

/**
 * Deploy a skill to a project-level directory with state tracking.
 */
export async function deployToProject(
  slug: string,
  tool: ToolName,
  rawProjectRoot: string,
): Promise<DeployResult> {
  const projectRoot = resolveProjectRoot(rawProjectRoot);
  const projectDir = projectDeployTargetDir(tool, projectRoot);

  try {
    await recordVersion(slug);
  } catch {
    // Non-critical
  }

  const result = await deploySkill(slug, tool, projectDir);

  const now = new Date().toISOString();
  await addLinkRecord({
    slug,
    tool,
    format: 'skill',
    linkPath: result.linkPath,
    targetPath: result.targetPath,
    createdAt: now,
    scope: 'project',
    projectRoot,
  });

  try {
    const meta = await readMeta(slug);
    meta.updatedAt = now;
    meta.lastDeployed = now;
    await writeMeta(slug, meta);
  } catch {
    // Non-critical
  }

  return {
    slug,
    tool,
    format: 'skill',
    scope: 'project',
    projectRoot,
    linkPath: result.linkPath,
    targetPath: result.targetPath,
    action: 'deployed',
  };
}

/**
 * Undeploy a skill from a project-level directory.
 */
export async function undeployProject(
  slug: string,
  tool: ToolName,
  rawProjectRoot: string,
): Promise<DeployResult> {
  const projectRoot = resolveProjectRoot(rawProjectRoot);
  const projectDir = projectDeployTargetDir(tool, projectRoot);
  const removed = await undeploySkill(slug, projectDir);
  // Always clean up state — if the symlink is already gone (e.g. project
  // directory deleted), the record is stale and should still be removed.
  await removeLinkRecord(slug, tool, 'project', projectRoot);
  return {
    slug,
    tool,
    format: 'skill',
    scope: 'project',
    projectRoot,
    linkPath: path.join(projectDir, slug),
    targetPath: '',
    action: removed ? 'undeployed' : 'skipped',
  };
}

function getFormat(deployAs: DeployAs, tool: ToolName): DeployFormat {
  const raw = tool === 'cc' ? deployAs.cc : deployAs.codex;
  return raw as DeployFormat;
}
