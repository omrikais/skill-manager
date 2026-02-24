import fs from 'fs-extra';
import { ResourceTemplate, type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { listSkills } from '../core/skill.js';
import { skillFile } from '../fs/paths.js';
import { validateSlug } from '../utils/errors.js';

export function registerResources(server: McpServer): void {
  // Dynamic resource template: individual skill content
  server.resource(
    'skill',
    new ResourceTemplate('skill://{slug}', {
      list: async () => {
        const skills = await listSkills();
        return {
          resources: skills.map((s) => ({
            uri: `skill://${s.slug}`,
            name: s.name,
            description: s.description,
            mimeType: 'text/markdown',
          })),
        };
      },
    }),
    { description: 'Raw markdown content of a managed skill' },
    async (uri, variables) => {
      const slug = variables.slug as string;
      validateSlug(slug);
      const mdPath = skillFile(slug);
      const content = await fs.readFile(mdPath, 'utf-8');
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'text/markdown',
            text: content,
          },
        ],
      };
    },
  );

  // Dynamic resource: full skill catalog
  server.resource(
    'skill-catalog',
    'skill-catalog://all',
    { description: 'JSON list of all managed skills' },
    async (uri) => {
      const skills = await listSkills();
      const catalog = skills.map((s) => ({
        slug: s.slug,
        name: s.name,
        description: s.description,
        tags: s.tags,
      }));
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(catalog, null, 2),
          },
        ],
      };
    },
  );
}
