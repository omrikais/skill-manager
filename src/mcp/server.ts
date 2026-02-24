import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerTools } from './tools/index.js';
import { registerResources } from './resources.js';
import { VERSION } from '../utils/version.js';

export async function startMcpServer(): Promise<void> {
  const server = new McpServer({
    name: 'sm-skills',
    version: VERSION,
  });

  registerTools(server);
  registerResources(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
