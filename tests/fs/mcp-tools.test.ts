import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { createTmpSmHome, type TmpSmHome } from '../helpers/tmpdir.js';

let tmp: TmpSmHome;

beforeEach(async () => {
  tmp = await createTmpSmHome();
  vi.resetModules();
});

afterEach(async () => {
  await tmp.cleanup();
});

async function createTestSkill(
  slug: string,
  frontmatter: Record<string, unknown>,
  metaOverrides?: { deployAs?: { cc?: string; codex?: string } },
) {
  const { skillDir, skillFile, skillMetaFile } = await import('../../src/fs/paths.js');
  await fs.ensureDir(skillDir(slug));

  let yaml = '---\n';
  for (const [key, value] of Object.entries(frontmatter)) {
    if (key === 'triggers') {
      yaml += 'triggers:\n';
      const triggers = value as Record<string, string[]>;
      if (triggers.files) {
        yaml += '  files:\n';
        for (const f of triggers.files) {
          yaml += `    - "${f}"\n`;
        }
      }
      if (triggers.dirs) {
        yaml += '  dirs:\n';
        for (const d of triggers.dirs) {
          yaml += `    - "${d}"\n`;
        }
      }
    } else if (Array.isArray(value)) {
      yaml += `${key}: [${value.map((v) => `"${v}"`).join(', ')}]\n`;
    } else {
      yaml += `${key}: "${value}"\n`;
    }
  }
  yaml += '---\n\n# ' + slug;
  await fs.writeFile(skillFile(slug), yaml, 'utf-8');

  await fs.writeJson(skillMetaFile(slug), {
    format: 'skill',
    source: { type: 'created' },
    tags: [],
    deployAs: {
      cc: metaOverrides?.deployAs?.cc ?? 'skill',
      codex: metaOverrides?.deployAs?.codex ?? 'skill',
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    usageCount: 0,
  });
}

describe('MCP resource templates', () => {
  describe('skill resource template', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function getTemplateEntry(server: unknown, name: string): any {
      return (server as Record<string, Record<string, unknown>>)._registeredResourceTemplates[name];
    }

    it('reads skill content by slug via variables', async () => {
      await createTestSkill('my-res', { name: 'My Resource', description: 'Res test', tags: ['test'] });

      const { skillFile } = await import('../../src/fs/paths.js');
      const fsModule = await import('fs-extra');
      const mdPath = skillFile('my-res');
      const content = await fsModule.default.readFile(mdPath, 'utf-8');

      const { registerResources } = await import('../../src/mcp/resources.js');
      const { McpServer } = await import('@modelcontextprotocol/sdk/server/mcp.js');

      const server = new McpServer({ name: 'test', version: '0.0.1' });
      registerResources(server);

      const entry = getTemplateEntry(server, 'skill');
      expect(entry).toBeDefined();

      const result = await entry.readCallback(new URL('skill://my-res'), { slug: 'my-res' });
      expect(result.contents).toHaveLength(1);
      expect(result.contents[0].mimeType).toBe('text/markdown');
      expect(result.contents[0].text).toBe(content);
      expect(result.contents[0].uri).toBe('skill://my-res');
    });

    it('lists all skills via the template list callback', async () => {
      await createTestSkill('alpha', { name: 'Alpha', description: 'First', tags: ['a'] });
      await createTestSkill('beta', { name: 'Beta', description: 'Second', tags: ['b'] });

      const { registerResources } = await import('../../src/mcp/resources.js');
      const { McpServer } = await import('@modelcontextprotocol/sdk/server/mcp.js');

      const server = new McpServer({ name: 'test', version: '0.0.1' });
      registerResources(server);

      const entry = getTemplateEntry(server, 'skill');
      expect(entry).toBeDefined();

      const listCb = entry.resourceTemplate.listCallback;
      expect(listCb).toBeDefined();

      const listed = await listCb();
      expect(listed.resources).toHaveLength(2);
      const uris = listed.resources.map((r: { uri: string }) => r.uri).sort();
      expect(uris).toEqual(['skill://alpha', 'skill://beta']);
    });
  });
});

describe('MCP tool handlers', () => {
  describe('list_skills', () => {
    it('returns all skills', async () => {
      await createTestSkill('alpha', { name: 'Alpha', description: 'First', tags: ['util'] });
      await createTestSkill('beta', { name: 'Beta', description: 'Second', tags: ['dev'] });

      const { listSkillsHandler } = await import('../../src/mcp/tools/list-skills.js');
      const result = await listSkillsHandler({});

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data).toHaveLength(2);
      expect(data[0].slug).toBe('alpha');
      expect(data[1].slug).toBe('beta');
    });

    it('filters by tag', async () => {
      await createTestSkill('alpha', { name: 'Alpha', description: 'First', tags: ['util'] });
      await createTestSkill('beta', { name: 'Beta', description: 'Second', tags: ['dev'] });

      const { listSkillsHandler } = await import('../../src/mcp/tools/list-skills.js');
      const result = await listSkillsHandler({ tag: 'dev' });

      const data = JSON.parse(result.content[0].text);
      expect(data).toHaveLength(1);
      expect(data[0].slug).toBe('beta');
    });

    it('filters deployed_only', async () => {
      await createTestSkill('alpha', { name: 'Alpha', description: 'First' });
      await createTestSkill('beta', { name: 'Beta', description: 'Second' });

      // Deploy alpha
      const { deploy } = await import('../../src/deploy/engine.js');
      const { resetStateCache } = await import('../../src/core/state.js');
      resetStateCache();
      await deploy('alpha', 'cc');

      const { listSkillsHandler } = await import('../../src/mcp/tools/list-skills.js');
      const result = await listSkillsHandler({ deployed_only: true });

      const data = JSON.parse(result.content[0].text);
      expect(data).toHaveLength(1);
      expect(data[0].slug).toBe('alpha');
      expect(data[0].deployedTo).toContain('cc');
    });
  });

  describe('get_skill', () => {
    it('returns skill content and metadata', async () => {
      await createTestSkill('my-skill', {
        name: 'My Skill',
        description: 'A test skill',
        tags: ['test'],
      });

      const { getSkillHandler } = await import('../../src/mcp/tools/get-skill.js');
      const result = await getSkillHandler({ slug: 'my-skill' });

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.slug).toBe('my-skill');
      expect(data.name).toBe('My Skill');
      expect(data.description).toBe('A test skill');
      expect(data.content).toContain('# my-skill');
      expect(data.files).toContain('SKILL.md');
    });

    it('returns error for nonexistent skill', async () => {
      const { getSkillHandler } = await import('../../src/mcp/tools/get-skill.js');
      const result = await getSkillHandler({ slug: 'nonexistent' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('SKILL_NOT_FOUND');
    });

    it('rejects path traversal slugs', async () => {
      const { getSkillHandler } = await import('../../src/mcp/tools/get-skill.js');
      const result = await getSkillHandler({ slug: '../../etc/passwd' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('INVALID_SLUG');
    });
  });

  describe('search_skills', () => {
    it('finds skills by query', async () => {
      await createTestSkill('rust-helper', { name: 'Rust Helper', description: 'Helps with Rust' });
      await createTestSkill('node-helper', { name: 'Node Helper', description: 'Helps with Node.js' });

      const { searchSkillsHandler } = await import('../../src/mcp/tools/search-skills.js');
      const result = await searchSkillsHandler({ query: 'rust' });

      const data = JSON.parse(result.content[0].text);
      expect(data).toHaveLength(1);
      expect(data[0].slug).toBe('rust-helper');
    });

    it('returns empty array for no matches', async () => {
      await createTestSkill('alpha', { name: 'Alpha', description: 'First' });

      const { searchSkillsHandler } = await import('../../src/mcp/tools/search-skills.js');
      const result = await searchSkillsHandler({ query: 'nonexistent' });

      const data = JSON.parse(result.content[0].text);
      expect(data).toHaveLength(0);
    });
  });

  describe('deploy_skill', () => {
    it('deploys a skill to cc', async () => {
      await createTestSkill('deploy-test', { name: 'Deploy Test', description: 'Test' });

      const { resetStateCache } = await import('../../src/core/state.js');
      resetStateCache();

      const { deploySkillHandler } = await import('../../src/mcp/tools/deploy-skill.js');
      const result = await deploySkillHandler({ slug: 'deploy-test', tool: 'cc' });

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.slug).toBe('deploy-test');
      expect(data.results).toHaveLength(1);
      expect(data.results[0].tool).toBe('cc');
      expect(data.results[0].action).toBe('deployed');
    });

    it('returns error for nonexistent skill', async () => {
      const { deploySkillHandler } = await import('../../src/mcp/tools/deploy-skill.js');
      const result = await deploySkillHandler({ slug: 'nonexistent' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('SKILL_NOT_FOUND');
    });

    it('rejects path traversal slugs', async () => {
      const { deploySkillHandler } = await import('../../src/mcp/tools/deploy-skill.js');
      const result = await deploySkillHandler({ slug: '../../../tmp/evil' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('INVALID_SLUG');
    });
  });

  describe('undeploy_skill', () => {
    it('undeploys a deployed skill', async () => {
      await createTestSkill('undeploy-test', { name: 'Undeploy Test', description: 'Test' });

      const { resetStateCache } = await import('../../src/core/state.js');
      resetStateCache();

      // Deploy first
      const { deploy } = await import('../../src/deploy/engine.js');
      await deploy('undeploy-test', 'cc');

      // Then undeploy
      const { undeploySkillHandler } = await import('../../src/mcp/tools/undeploy-skill.js');
      const result = await undeploySkillHandler({ slug: 'undeploy-test', tool: 'cc' });

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.slug).toBe('undeploy-test');
      expect(data.results[0].action).toBe('undeployed');
    });

    it('rejects path traversal slugs', async () => {
      const { undeploySkillHandler } = await import('../../src/mcp/tools/undeploy-skill.js');
      const result = await undeploySkillHandler({ slug: 'foo/../../bar' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('INVALID_SLUG');
    });
  });

  describe('suggest_skills', () => {
    it('returns suggestions for a project', async () => {
      await createTestSkill('ts-helper', {
        name: 'TypeScript Helper',
        description: 'TypeScript support',
        triggers: { files: ['tsconfig.json'] },
      });

      const projectDir = path.join(os.tmpdir(), `sm-mcp-suggest-${Date.now()}`);
      await fs.ensureDir(projectDir);
      await fs.writeFile(path.join(projectDir, 'tsconfig.json'), '{}', 'utf-8');

      try {
        const { suggestSkillsHandler } = await import('../../src/mcp/tools/suggest-skills.js');
        const result = await suggestSkillsHandler({ project_root: projectDir });

        expect(result.isError).toBeUndefined();
        const data = JSON.parse(result.content[0].text);
        expect(data.suggestions).toHaveLength(1);
        expect(data.suggestions[0].slug).toBe('ts-helper');
      } finally {
        await fs.remove(projectDir);
      }
    });
  });

  describe('get_analytics', () => {
    it('returns analytics data', async () => {
      await createTestSkill('analytics-test', { name: 'Analytics Test', description: 'Test' });

      const { getAnalyticsHandler } = await import('../../src/mcp/tools/get-analytics.js');
      const result = await getAnalyticsHandler({});

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.totalSkills).toBe(1);
      expect(data.stats).toHaveLength(1);
      expect(data.stats[0].slug).toBe('analytics-test');
    });
  });

  describe('list_sources', () => {
    async function seedSources(sources: Array<Record<string, unknown>>) {
      const { SM_SOURCES_REGISTRY } = await import('../../src/fs/paths.js');
      const { resetSourcesCache } = await import('../../src/core/sources.js');
      await fs.writeJson(SM_SOURCES_REGISTRY, { version: 1, sources });
      resetSourcesCache();
    }

    it('returns empty array when no sources configured', async () => {
      const { listSourcesHandler } = await import('../../src/mcp/tools/list-sources.js');
      const result = await listSourcesHandler({});

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data).toEqual([]);
    });

    it('returns sources with derived status field', async () => {
      await seedSources([
        { name: 'good-repo', url: 'https://github.com/org/good-repo', addedAt: '2025-01-01T00:00:00.000Z', lastSync: '2025-06-01T00:00:00.000Z', skillCount: 5 },
        { name: 'bad-repo', url: 'https://github.com/org/bad-repo', addedAt: '2025-01-01T00:00:00.000Z', lastError: 'clone failed', skillCount: 0 },
      ]);

      const { listSourcesHandler } = await import('../../src/mcp/tools/list-sources.js');
      const result = await listSourcesHandler({});

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data).toHaveLength(2);
      expect(data[0].name).toBe('good-repo');
      expect(data[0].status).toBe('ok');
      expect(data[1].name).toBe('bad-repo');
      expect(data[1].status).toBe('error');
    });

    it('filters by name when provided', async () => {
      await seedSources([
        { name: 'repo-a', url: 'https://github.com/org/repo-a', addedAt: '2025-01-01T00:00:00.000Z', skillCount: 3 },
        { name: 'repo-b', url: 'https://github.com/org/repo-b', addedAt: '2025-01-01T00:00:00.000Z', skillCount: 7 },
      ]);

      const { listSourcesHandler } = await import('../../src/mcp/tools/list-sources.js');
      const result = await listSourcesHandler({ name: 'repo-b' });

      const data = JSON.parse(result.content[0].text);
      expect(data).toHaveLength(1);
      expect(data[0].name).toBe('repo-b');
      expect(data[0].skillCount).toBe(7);
    });

    it('returns error for nonexistent source name', async () => {
      const { listSourcesHandler } = await import('../../src/mcp/tools/list-sources.js');
      const result = await listSourcesHandler({ name: 'no-such-source' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('SOURCE_NOT_FOUND');
    });
  });

  describe('sync_source', () => {
    async function seedSources(sources: Array<Record<string, unknown>>) {
      const { SM_SOURCES_REGISTRY } = await import('../../src/fs/paths.js');
      const { resetSourcesCache } = await import('../../src/core/sources.js');
      await fs.writeJson(SM_SOURCES_REGISTRY, { version: 1, sources });
      resetSourcesCache();
    }

    it('syncs all sources', async () => {
      await seedSources([
        { name: 'repo-a', url: 'https://github.com/org/repo-a', addedAt: '2025-01-01T00:00:00.000Z', skillCount: 0 },
        { name: 'repo-b', url: 'https://github.com/org/repo-b', addedAt: '2025-01-01T00:00:00.000Z', skillCount: 0 },
      ]);

      // Mock git and scanner
      vi.doMock('../../src/sources/git.js', () => ({
        cloneOrPull: vi.fn(async () => '/tmp/fake-repo'),
      }));
      vi.doMock('../../src/sources/scanner.js', () => ({
        scanSourceRepo: vi.fn(async () => [
          { slug: 'skill-1', name: 'Skill 1', installed: false },
          { slug: 'skill-2', name: 'Skill 2', installed: false },
        ]),
      }));

      const { syncSourceHandler } = await import('../../src/mcp/tools/sync-source.js');
      const result = await syncSourceHandler({});

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.synced).toBe(2);
      expect(data.results).toHaveLength(2);
      expect(data.results[0].success).toBe(true);
      expect(data.results[0].skillCount).toBe(2);
      expect(data.results[1].success).toBe(true);

      // Verify registry was updated
      const { loadSourcesRegistry, resetSourcesCache } = await import('../../src/core/sources.js');
      resetSourcesCache();
      const registry = await loadSourcesRegistry();
      expect(registry.sources[0].skillCount).toBe(2);
      expect(registry.sources[0].lastSync).toBeDefined();
    });

    it('syncs a single named source', async () => {
      await seedSources([
        { name: 'repo-a', url: 'https://github.com/org/repo-a', addedAt: '2025-01-01T00:00:00.000Z', skillCount: 0 },
        { name: 'repo-b', url: 'https://github.com/org/repo-b', addedAt: '2025-01-01T00:00:00.000Z', skillCount: 0 },
      ]);

      vi.doMock('../../src/sources/git.js', () => ({
        cloneOrPull: vi.fn(async () => '/tmp/fake-repo'),
      }));
      vi.doMock('../../src/sources/scanner.js', () => ({
        scanSourceRepo: vi.fn(async () => [{ slug: 's1', name: 'S1', installed: false }]),
      }));

      const { syncSourceHandler } = await import('../../src/mcp/tools/sync-source.js');
      const result = await syncSourceHandler({ name: 'repo-a' });

      const data = JSON.parse(result.content[0].text);
      expect(data.synced).toBe(1);
      expect(data.results[0].name).toBe('repo-a');
      expect(data.results[0].success).toBe(true);
    });

    it('returns error for nonexistent source name', async () => {
      const { syncSourceHandler } = await import('../../src/mcp/tools/sync-source.js');
      const result = await syncSourceHandler({ name: 'no-such-source' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('SOURCE_NOT_FOUND');
    });

    it('handles git failure gracefully', async () => {
      await seedSources([
        { name: 'fail-repo', url: 'https://github.com/org/fail-repo', addedAt: '2025-01-01T00:00:00.000Z', skillCount: 0 },
      ]);

      vi.doMock('../../src/sources/git.js', () => ({
        cloneOrPull: vi.fn(async () => { throw new Error('network timeout'); }),
      }));
      vi.doMock('../../src/sources/scanner.js', () => ({
        scanSourceRepo: vi.fn(async () => []),
      }));

      const { syncSourceHandler } = await import('../../src/mcp/tools/sync-source.js');
      const result = await syncSourceHandler({});

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.results[0].success).toBe(false);
      expect(data.results[0].error).toBe('network timeout');

      // Verify lastError was set in registry
      const { loadSourcesRegistry, resetSourcesCache } = await import('../../src/core/sources.js');
      resetSourcesCache();
      const registry = await loadSourcesRegistry();
      expect(registry.sources[0].lastError).toBe('network timeout');
    });
  });
});
