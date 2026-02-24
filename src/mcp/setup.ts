import { execFileSync } from 'node:child_process';
import chalk from 'chalk';
import type { ToolName } from '../fs/paths.js';
import { SmError } from '../utils/errors.js';

interface McpSetupOptions {
  tool: string;
  scope: string;
}

function resolveSmPath(): string {
  try {
    const cmd = process.platform === 'win32' ? 'where' : 'which';
    return execFileSync(cmd, ['sm'], { encoding: 'utf-8' }).trim().split('\n')[0].trim();
  } catch {
    return 'sm';
  }
}

export interface McpCommandResult {
  succeeded: ToolName[];
  failed: ToolName[];
  skipped: ToolName[];
}

function setupClaudeCode(scope: string, smPath: string): boolean {
  try {
    execFileSync(
      'claude',
      ['mcp', 'add', '--scope', scope, '--transport', 'stdio', 'sm-skills', '--', smPath, 'mcp'],
      { stdio: 'pipe', encoding: 'utf-8' },
    );
    console.log(chalk.green(`\u2713 Registered sm-skills MCP server in Claude Code (${scope})`));
    return true;
  } catch (err) {
    // `claude mcp add` exits 1 when the server is already registered — treat as success
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('already exists')) {
      console.log(chalk.green(`\u2713 sm-skills MCP server already configured in Claude Code (${scope})`));
      return true;
    }
    console.log(chalk.yellow('\u26a0 Could not run `claude mcp add`. Add manually:\n'));
    if (scope === 'project') {
      console.log('  Add to .mcp.json in your project root:\n');
    } else {
      console.log(`  Run: claude mcp add --scope ${scope} --transport stdio sm-skills -- ${smPath} mcp\n`);
      console.log('  Or add to your MCP config:\n');
    }
    console.log(JSON.stringify({
      mcpServers: {
        'sm-skills': {
          command: smPath,
          args: ['mcp'],
        },
      },
    }, null, 2));
    console.log();
    return false;
  }
}

function setupCodex(scope: string, smPath: string): boolean | 'skipped' {
  if (scope !== 'user') {
    console.log(chalk.yellow(`\u26a0 Codex CLI only supports user-scoped MCP servers (got "${scope}"). Use user scope instead:\n`));
    console.log(`  sm mcp setup --tool codex --scope user\n`);
    return 'skipped';
  }

  try {
    execFileSync(
      'codex',
      ['mcp', 'add', 'sm-skills', '--', smPath, 'mcp'],
      { stdio: 'pipe', encoding: 'utf-8' },
    );
    console.log(chalk.green(`\u2713 Registered sm-skills MCP server in Codex CLI (user)`));
    return true;
  } catch {
    console.log(chalk.yellow('\u26a0 Could not run `codex mcp add`. Add manually:\n'));
    console.log('  Add to ~/.codex/config.toml:\n');
    console.log(`  [mcp_servers.sm-skills]`);
    console.log(`  command = "${smPath}"`);
    console.log(`  args = ["mcp"]`);
    console.log();
    return false;
  }
}

export async function mcpSetupCommand(opts: McpSetupOptions): Promise<McpCommandResult> {
  validateScope(opts.scope);
  const smPath = resolveSmPath();
  const tools = resolveSetupTools(opts.tool);
  const result: McpCommandResult = { succeeded: [], failed: [], skipped: [] };

  for (const tool of tools) {
    if (tool === 'cc') {
      const ok = setupClaudeCode(opts.scope, smPath);
      (ok ? result.succeeded : result.failed).push(tool);
    } else {
      const ok = setupCodex(opts.scope, smPath);
      if (ok === 'skipped') result.skipped.push(tool);
      else (ok ? result.succeeded : result.failed).push(tool);
    }
  }

  return result;
}

function uninstallClaudeCode(scope: string): boolean {
  try {
    execFileSync(
      'claude',
      ['mcp', 'remove', '--scope', scope, 'sm-skills'],
      { stdio: 'pipe', encoding: 'utf-8' },
    );
    console.log(chalk.green(`\u2713 Removed sm-skills MCP server from Claude Code (${scope})`));
    return true;
  } catch (err) {
    // `claude mcp remove` exits 1 when the server doesn't exist — treat as success
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('No ') && msg.includes('MCP server')) {
      console.log(chalk.green(`\u2713 sm-skills MCP server already removed from Claude Code (${scope})`));
      return true;
    }
    console.log(chalk.yellow(`\u26a0 Could not run \`claude mcp remove\`. Remove manually:\n`));
    console.log(`  Run: claude mcp remove --scope ${scope} sm-skills\n`);
    return false;
  }
}

function uninstallCodex(scope: string): boolean | 'skipped' {
  if (scope !== 'user') {
    console.log(chalk.yellow(`\u26a0 Codex CLI only supports user-scoped MCP servers (got "${scope}"). Nothing to uninstall.`));
    return 'skipped';
  }

  try {
    execFileSync(
      'codex',
      ['mcp', 'remove', 'sm-skills'],
      { stdio: 'pipe', encoding: 'utf-8' },
    );
    console.log(chalk.green(`\u2713 Removed sm-skills MCP server from Codex CLI`));
    return true;
  } catch {
    console.log(chalk.yellow(`\u26a0 Could not run \`codex mcp remove\`. Remove manually:\n`));
    console.log(`  Run: codex mcp remove sm-skills\n`);
    return false;
  }
}

export async function mcpUninstallCommand(opts: McpSetupOptions): Promise<McpCommandResult> {
  validateScope(opts.scope);
  const tools = resolveSetupTools(opts.tool);
  const result: McpCommandResult = { succeeded: [], failed: [], skipped: [] };

  for (const tool of tools) {
    if (tool === 'cc') {
      const ok = uninstallClaudeCode(opts.scope);
      (ok ? result.succeeded : result.failed).push(tool);
    } else {
      const ok = uninstallCodex(opts.scope);
      if (ok === 'skipped') result.skipped.push(tool);
      else (ok ? result.succeeded : result.failed).push(tool);
    }
  }

  return result;
}

function resolveSetupTools(tool: string): ToolName[] {
  if (tool === 'cc') return ['cc'];
  if (tool === 'codex') return ['codex'];
  if (tool === 'all') return ['cc', 'codex'];
  throw new SmError(`Unknown tool "${tool}". Must be cc, codex, or all.`, 'USAGE_ERROR');
}

const VALID_SCOPES = ['user', 'local', 'project'];

function validateScope(scope: string): void {
  if (!VALID_SCOPES.includes(scope)) {
    throw new SmError(`Unknown scope "${scope}". Must be user, local, or project.`, 'USAGE_ERROR');
  }
}
