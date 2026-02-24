import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { listSkillsSchema, listSkillsHandler } from './list-skills.js';
import { getSkillSchema, getSkillHandler } from './get-skill.js';
import { searchSkillsSchema, searchSkillsHandler } from './search-skills.js';
import { deploySkillSchema, deploySkillHandler } from './deploy-skill.js';
import { undeploySkillSchema, undeploySkillHandler } from './undeploy-skill.js';
import { suggestSkillsSchema, suggestSkillsHandler } from './suggest-skills.js';
import { getAnalyticsSchema, getAnalyticsHandler } from './get-analytics.js';
import { listSourcesSchema, listSourcesHandler } from './list-sources.js';
import { syncSourceSchema, syncSourceHandler } from './sync-source.js';

export function registerTools(server: McpServer): void {
  server.tool(
    'list_skills',
    'List all managed skills with optional filtering by tag or deployment status',
    listSkillsSchema.shape,
    listSkillsHandler,
  );

  server.tool(
    'get_skill',
    'Read a skill\'s full content, metadata, and deployment info',
    getSkillSchema.shape,
    getSkillHandler,
  );

  server.tool(
    'search_skills',
    'Search skills by name, description, tags, or content',
    searchSkillsSchema.shape,
    searchSkillsHandler,
  );

  server.tool(
    'deploy_skill',
    'Deploy a skill to Claude Code and/or Codex CLI with automatic dependency resolution',
    deploySkillSchema.shape,
    deploySkillHandler,
  );

  server.tool(
    'undeploy_skill',
    'Remove a skill deployment from Claude Code and/or Codex CLI',
    undeploySkillSchema.shape,
    undeploySkillHandler,
  );

  server.tool(
    'suggest_skills',
    'Get trigger-based skill suggestions for a project directory',
    suggestSkillsSchema.shape,
    suggestSkillsHandler,
  );

  server.tool(
    'get_analytics',
    'Get skill usage statistics, stale skills, and unused skills',
    getAnalyticsSchema.shape,
    getAnalyticsHandler,
  );

  server.tool(
    'list_sources',
    'List configured remote skill sources with sync status',
    listSourcesSchema.shape,
    listSourcesHandler,
  );

  server.tool(
    'sync_source',
    'Sync one or all remote skill sources (git pull + rescan)',
    syncSourceSchema.shape,
    syncSourceHandler,
  );
}
