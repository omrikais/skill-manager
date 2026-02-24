import { Command } from 'commander';
import { importCommand } from '../src/commands/import.js';
import { listCommand } from '../src/commands/list.js';
import { addCommand } from '../src/commands/add.js';
import { removeCommand } from '../src/commands/remove.js';
import { syncCommand } from '../src/commands/sync.js';
import { infoCommand } from '../src/commands/info.js';
import { doctorCommand } from '../src/commands/doctor.js';
import { createCommand } from '../src/commands/create.js';
import { editCommand } from '../src/commands/edit.js';
import { searchCommand } from '../src/commands/search.js';
import { convertCommand } from '../src/commands/convert.js';
import { initCommand } from '../src/commands/init.js';
import { installCommand } from '../src/commands/install.js';
import { profileCommand } from '../src/commands/profile.js';
import { backupCommand, restoreCommand, backupListCommand } from '../src/commands/backup.js';
import { completionCommand } from '../src/commands/completion.js';
import { historyCommand, rollbackCommand } from '../src/commands/history.js';
import { suggestCommand } from '../src/commands/suggest.js';
import { hooksRunCommand, hooksSetupCommand } from '../src/commands/hooks.js';
import { analyticsCommand } from '../src/commands/analytics.js';
import { sourceAddCommand, sourceListCommand, sourceSyncCommand, sourceRemoveCommand } from '../src/commands/source.js';
import { packListCommand, packInstallCommand } from '../src/commands/pack.js';
import { publishCommand } from '../src/commands/publish.js';
import { generateCommand } from '../src/commands/generate.js';
import { resolveInstallTarget, isSourceUrl, isGitHubShorthand } from '../src/core/install-resolver.js';
import { loadConfig } from '../src/core/config.js';
import { setLogLevel } from '../src/utils/logger.js';
import { withErrorHandler, validateSlug, UsageError } from '../src/utils/errors.js';
import { VERSION } from '../src/utils/version.js';

const program = new Command();

program
  .name('sm')
  .description('Skill Manager — Unified skill management for Claude Code & Codex CLI')
  .version(VERSION)
  .enablePositionalOptions();

// Default action: launch TUI
program.action(async () => {
  try {
    const { launchTUI } = await import('../src/tui/App.js');
    await launchTUI();
  } catch (err) {
    console.error('Failed to launch TUI:', err);
    process.exit(1);
  }
});

program
  .command('import')
  .argument('[path]', 'Path to a skill directory containing SKILL.md')
  .description('Import skills — from a local path or bulk from CC/Codex directories')
  .option('--from <source>', 'Source to import from (all|cc|codex)', 'all')
  .option('--dry-run', 'Show what would be imported without making changes')
  .action(
    withErrorHandler(async (pathArg, opts) => {
      await importCommand({ ...opts, path: pathArg });
    }),
  );

program
  .command('list')
  .alias('ls')
  .description('List all managed skills')
  .option('--cc', 'Show only CC-deployed skills')
  .option('--codex', 'Show only Codex-deployed skills')
  .option('--status', 'Show detailed status information')
  .option('--project', 'Show only project-scoped deployments for current directory')
  .action(
    withErrorHandler(async (opts) => {
      await listCommand(opts);
    }),
  );

program
  .command('add <name>')
  .description('Deploy a skill to tool(s)')
  .option('--cc', 'Deploy to Claude Code')
  .option('--codex', 'Deploy to Codex CLI')
  .option('--all', 'Deploy to all tools')
  .option('--no-deps', 'Skip dependency auto-deploy')
  .option('--project', 'Deploy to current project directory')
  .action(
    withErrorHandler(async (name, opts) => {
      validateSlug(name as string);
      await addCommand(name as string, opts);
    }),
  );

program
  .command('remove <name>')
  .alias('rm')
  .description('Undeploy a skill from tool(s)')
  .option('--cc', 'Remove from Claude Code')
  .option('--codex', 'Remove from Codex CLI')
  .option('--purge', 'Also delete from canonical store')
  .option('--force', 'Skip dependent safety check')
  .option('--project', 'Remove from current project directory')
  .action(
    withErrorHandler(async (name, opts) => {
      validateSlug(name as string);
      await removeCommand(name as string, opts);
    }),
  );

program
  .command('sync')
  .description('Validate and optionally repair all symlinks')
  .option('--dry-run', 'Show what would be changed')
  .option('--repair', 'Automatically repair broken links')
  .action(
    withErrorHandler(async (opts) => {
      await syncCommand(opts);
    }),
  );

program
  .command('info <name>')
  .description('Show detailed info about a skill')
  .action(
    withErrorHandler(async (name) => {
      validateSlug(name as string);
      await infoCommand(name as string);
    }),
  );

program
  .command('doctor')
  .description('Run health checks')
  .action(
    withErrorHandler(async () => {
      await doctorCommand();
    }),
  );

program
  .command('create <name>')
  .description('Create a new skill from template')
  .option('--template <name>', 'Template to use (basic|full)', 'basic')
  .action(
    withErrorHandler(async (name, opts) => {
      validateSlug(name as string);
      await createCommand(name as string, opts);
    }),
  );

program
  .command('edit <name>')
  .description('Open a skill in $EDITOR')
  .action(
    withErrorHandler(async (name) => {
      validateSlug(name as string);
      await editCommand(name as string);
    }),
  );

program
  .command('search <query>')
  .description('Search skills by name, description, or tags')
  .action(
    withErrorHandler(async (query) => {
      await searchCommand(query as string);
    }),
  );

program
  .command('convert <name>')
  .description('Convert a legacy skill to new format')
  .action(
    withErrorHandler(async (name) => {
      validateSlug(name as string);
      await convertCommand(name as string);
    }),
  );

program
  .command('init')
  .description('Create a .skills.json project manifest')
  .option('--from-current', 'Populate from currently deployed skills')
  .action(
    withErrorHandler(async (opts) => {
      await initCommand(opts);
    }),
  );

program
  .command('install [args...]')
  .description('Install skills from a URL, GitHub shorthand (user/repo), external command, or project manifest')
  .option('--profile <name>', 'Apply a specific profile')
  .option('-f, --force', 'Update existing skills without prompting')
  .passThroughOptions()
  .action(
    withErrorHandler(async (args: string[], opts) => {
      // With passThroughOptions, our own flags after positional args end up in
      // args instead of opts. Two strategies based on input type:
      //
      // Direct source (URL/shorthand first): strip SM flags from any position
      //   e.g., `sm install user/repo --force skill-a`
      //
      // External command (runner first): strip SM flags only from trailing
      //   position — embedded flags belong to the external tool, but trailing
      //   flags appended by the user are SM flags.
      //   e.g., `npx tool add --force user/repo` → --force is external tool's
      //   e.g., `npx tool add user/repo --force` → --force is SM's
      const first = args[0] ?? '';
      const isDirectSource = isSourceUrl(first) || isGitHubShorthand(first);
      const cleaned: string[] = [];
      if (isDirectSource) {
        for (let i = 0; i < args.length; i++) {
          if (args[i] === '--force' || args[i] === '-f') {
            opts.force = true;
          } else if (args[i] === '--profile') {
            if (i + 1 >= args.length) throw new UsageError('--profile requires a value');
            opts.profile = args[++i];
          } else {
            cleaned.push(args[i]);
          }
        }
      } else {
        cleaned.push(...args);
        // Extract trailing SM flags only
        if (cleaned.length > 0 && (cleaned[cleaned.length - 1] === '--force' || cleaned[cleaned.length - 1] === '-f')) {
          opts.force = true;
          cleaned.pop();
        }
        if (cleaned.length > 0 && cleaned[cleaned.length - 1] === '--profile') {
          throw new UsageError('--profile requires a value');
        }
        if (cleaned.length >= 2 && cleaned[cleaned.length - 2] === '--profile') {
          opts.profile = cleaned[cleaned.length - 1];
          cleaned.splice(-2);
        }
        if (cleaned.length > 0 && (cleaned[cleaned.length - 1] === '--force' || cleaned[cleaned.length - 1] === '-f')) {
          opts.force = true;
          cleaned.pop();
        }
      }

      const target = resolveInstallTarget(cleaned);
      if (target.type === 'source') {
        if (opts.profile) {
          throw new UsageError('`--profile` cannot be combined with a source URL');
        }
        await sourceAddCommand(target.url, {
          install: true,
          slugs: target.slugs.length > 0 ? target.slugs : undefined,
          force: opts.force,
        });
        return;
      }
      await installCommand(opts);
    }),
  );

program
  .command('profile <action> [name]')
  .description('Manage skill profiles (list|create|apply|delete)')
  .action(
    withErrorHandler(async (action, name) => {
      await profileCommand(action as string, name as string | undefined);
    }),
  );

program
  .command('backup')
  .description('Create a backup of all skills and links')
  .action(
    withErrorHandler(async () => {
      await backupCommand();
    }),
  );

program
  .command('restore <id>')
  .description('Restore from a backup')
  .action(
    withErrorHandler(async (id) => {
      await restoreCommand(id as string);
    }),
  );

program
  .command('backups')
  .description('List available backups')
  .action(
    withErrorHandler(async () => {
      await backupListCommand();
    }),
  );

program
  .command('history <name>')
  .description('Show version history for a skill')
  .action(
    withErrorHandler(async (name) => {
      validateSlug(name as string);
      await historyCommand(name as string);
    }),
  );

program
  .command('rollback <name> [version]')
  .description('Restore a skill to a previous version')
  .action(
    withErrorHandler(async (name, version) => {
      validateSlug(name as string);
      await rollbackCommand(name as string, version as string | undefined);
    }),
  );

program
  .command('suggest')
  .description('Suggest skills for current project based on triggers')
  .option('--apply', 'Auto-deploy matching skills')
  .option('--json', 'Output as JSON')
  .action(
    withErrorHandler(async (opts) => {
      await suggestCommand(opts);
    }),
  );

program
  .command('completion <shell>')
  .description('Output shell completion script (bash|zsh|fish)')
  .action(
    withErrorHandler(async (shell) => {
      const script = completionCommand(shell as 'bash' | 'zsh' | 'fish');
      process.stdout.write(script);
    }),
  );

const hooks = program.command('hooks').description('Manage Claude Code session hooks');

hooks
  .command('setup')
  .description('Configure Claude Code SessionStart hook')
  .option('--project', 'Write to project settings instead of global')
  .action(
    withErrorHandler(async (opts) => {
      await hooksSetupCommand(opts);
    }),
  );

hooks
  .command('run <event>')
  .description('Execute a hook event (called by Claude Code)')
  .action(
    withErrorHandler(async (event) => {
      await hooksRunCommand(event as string);
    }),
  );

program
  .command('analytics')
  .description('Show skill usage analytics')
  .option('--json', 'Output as JSON')
  .action(
    withErrorHandler(async (opts) => {
      await analyticsCommand(opts);
    }),
  );

// Source management subcommand group
const source = program.command('source').description('Manage remote skill repositories');

source
  .command('add <url>')
  .description('Add a git repository as a skill source')
  .option('--install', 'Import all discovered skills immediately')
  .action(
    withErrorHandler(async (url, opts) => {
      await sourceAddCommand(url as string, opts);
    }),
  );

source
  .command('list')
  .alias('ls')
  .description('List configured skill sources')
  .option('--json', 'Output as JSON')
  .action(
    withErrorHandler(async (opts) => {
      await sourceListCommand(opts);
    }),
  );

source
  .command('sync [name]')
  .description('Pull updates from one or all sources')
  .action(
    withErrorHandler(async (name) => {
      await sourceSyncCommand({ name: name as string | undefined });
    }),
  );

source
  .command('remove <name>')
  .alias('rm')
  .description('Remove a configured source')
  .option('--purge', 'Also delete the cloned repo from disk')
  .action(
    withErrorHandler(async (name, opts) => {
      await sourceRemoveCommand(name as string, opts);
    }),
  );

// Pack subcommand group
const pack = program.command('pack').description('Install curated skill packs');

pack
  .command('list')
  .alias('ls')
  .description('List available skill packs')
  .option('--json', 'Output as JSON')
  .action(
    withErrorHandler(async (opts) => {
      await packListCommand(opts);
    }),
  );

pack
  .command('install <name>')
  .description('Install a curated skill pack')
  .option('--dry-run', 'Show what would be installed')
  .action(
    withErrorHandler(async (name, opts) => {
      await packInstallCommand(name as string, opts);
    }),
  );

// Publish command
program
  .command('publish <name>')
  .description('Export a skill to a portable directory structure')
  .requiredOption('--out <dir>', 'Output directory')
  .option('--overwrite', 'Overwrite if target already exists')
  .action(
    withErrorHandler(async (name, opts) => {
      validateSlug(name as string);
      await publishCommand(name as string, opts);
    }),
  );

// MCP server subcommand group
const mcp = program.command('mcp').description('MCP server for AI tool integration');

mcp.action(async () => {
  const { startMcpServer } = await import('../src/mcp/server.js');
  await startMcpServer();
});

mcp
  .command('setup')
  .description('Configure MCP server in Claude Code and/or Codex CLI')
  .option('--tool <tool>', 'Target tool: cc, codex, or all', 'all')
  .option('--scope <scope>', 'Configuration scope (local|project|user)', 'user')
  .action(
    withErrorHandler(async (opts) => {
      const { mcpSetupCommand } = await import('../src/mcp/setup.js');
      await mcpSetupCommand(opts);
    }),
  );

mcp
  .command('uninstall')
  .description('Remove MCP server from Claude Code and/or Codex CLI')
  .option('--tool <tool>', 'Target tool: cc, codex, or all', 'all')
  .option('--scope <scope>', 'Configuration scope (local|project|user)', 'user')
  .action(
    withErrorHandler(async (opts) => {
      const { mcpUninstallCommand } = await import('../src/mcp/setup.js');
      await mcpUninstallCommand(opts);
    }),
  );

// Generate subcommand group
const generate = program.command('generate').description('Generate project-aware CLAUDE.md / AGENTS.md files');

const generateOpts = (cmd: Command) =>
  cmd
    .option('--mode <mode>', 'Output mode: inline, reference, or summary', 'inline')
    .option('--include-skills', 'Include installed skills section')
    .option('--with-mcp', 'Include MCP integration section')
    .option('--strict', 'Fail if required facts are missing')
    .option('--section <name>', 'Update only one section')
    .option('--dry-run', 'Show what would be generated without writing')
    .option('--write', 'Apply changes (default is preview only)');

generateOpts(generate.command('claude-md').description('Generate CLAUDE.md')).action(
  withErrorHandler(async (opts) => {
    await generateCommand('claude-md', opts);
  }),
);

generateOpts(generate.command('agents-md').description('Generate AGENTS.md')).action(
  withErrorHandler(async (opts) => {
    await generateCommand('agents-md', opts);
  }),
);

generateOpts(generate.command('both').description('Generate both CLAUDE.md and AGENTS.md'))
  .option('--symlink <mode>', 'Symlink mode: claude-to-agents, agents-to-claude, or none')
  .action(
    withErrorHandler(async (opts) => {
      await generateCommand('both', opts);
    }),
  );

// Auto-adopt: detect unmanaged skills before each command
program.hook('preAction', async (_thisCommand, actionCommand) => {
  // Skip TUI — it handles adopt internally via useEffect
  if (!actionCommand.parent) return;
  // Skip side-effect-free command groups (walk parent chain, excluding root)
  const skip = new Set(['completion', 'mcp']);
  let cmd: Command | null = actionCommand;
  while (cmd?.parent) {
    if (skip.has(cmd.name())) return;
    cmd = cmd.parent;
  }
  // Respect --dry-run: no filesystem mutations in preview mode
  if (actionCommand.opts().dryRun) return;
  try {
    const config = await loadConfig();
    if (config.autoAdopt !== false) {
      const { autoAdopt } = await import('../src/core/adopt.js');
      await autoAdopt({ projectRoot: process.cwd() });
    }
  } catch {
    // Never block the actual command
  }
});

async function main() {
  try {
    const config = await loadConfig();
    setLogLevel(config.logLevel);
  } catch {
    // Config not critical, continue with defaults
  }

  await program.parseAsync(process.argv);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
