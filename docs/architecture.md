# Architecture Overview

`sm` is a unified skill manager for Claude Code and Codex CLI. It maintains a canonical store of skills and deploys them to tool directories via symlinks.

## Directory Structure

```
bin/sm.ts                → CLI entry point (Commander.js)
src/
├── core/                → Business logic
│   ├── skill.ts         → Skill loading, listing, deletion
│   ├── meta.ts          → Per-skill metadata (.sm-meta.json)
│   ├── state.ts         → Global state (state.json) — link records, timestamps
│   ├── config.ts        → User config (config.toml)
│   ├── frontmatter.ts   → YAML frontmatter parsing/serialization
│   ├── manifest.ts      → Project-level .skills.json manifests
│   ├── hash.ts          → SHA-256 content hashing
│   ├── dedup.ts         → Duplicate skill detection
│   ├── analytics.ts     → Usage stats, stale/unused skill detection
│   ├── versioning.ts    → Content-hash version snapshots (.sm-history.json)
│   ├── deps.ts          → Dependency graph with cycle detection
│   ├── triggers.ts      → File/directory-based skill activation triggers
│   ├── hooks.ts         → Session-start hook logic (auto-deploy on project open)
│   ├── sources.ts       → Remote source registry management
│   ├── packs.ts         → Bundled skill pack definitions
│   ├── adopt.ts         → Auto-import of unmanaged skills
│   └── install-resolver.ts → Install argument parsing (URLs, GitHub shorthand)
├── fs/                  → Filesystem operations
│   ├── paths.ts         → All path constants and helper functions
│   ├── links.ts         → Atomic symlink creation (temp → rename)
│   ├── scanner.ts       → Skill directory scanner
│   └── backup.ts        → Backup/restore of skill store
├── deploy/              → Deploy engine
│   ├── engine.ts        → Orchestrator — reads meta, delegates to strategies
│   └── strategies/      → Per-format deploy logic
│       ├── skill-strategy.ts      → Directory symlink deployment
│       ├── legacy-command.ts      → Claude Code command file symlink
│       └── legacy-prompt.ts       → Codex prompt file symlink
├── commands/            → CLI command handlers (one file per command group)
├── tui/                 → Ink v6 terminal UI
│   ├── App.tsx          → Root component, screen state machine
│   ├── screens/         → 7 screens (Dashboard, Browser, Detail, Import, Profiles, Sync, Sources)
│   ├── hooks/           → React hooks for TUI state
│   └── components/      → Shared TUI components
├── mcp/                 → MCP server (stdio transport)
│   ├── server.ts        → Server initialization
│   ├── tools/           → 9 tool handlers
│   ├── resources.ts     → skill:// and skill-catalog:// resources
│   └── setup.ts         → MCP registration in Claude Code / Codex CLI
├── utils/               → Shared utilities
│   ├── errors.ts        → Error classes with codes
│   ├── logger.ts        → Stderr logger
│   ├── slug.ts          → slugify() function
│   ├── platform.ts      → OS detection, editor resolution
│   └── table.ts         → Terminal table formatting
├── sources/             → Remote source operations
│   ├── git.ts           → Clone/pull with simple-git
│   ├── scanner.ts       → Scan cloned repos for skills
│   └── publish.ts       → Export skills for sharing
packs/                   → Bundled pack JSON definitions
templates/               → Skill templates for `sm create`
tests/                   → Vitest test suite
```

## Data Flow

### Skill Lifecycle

```
Create/Import → Canonical Store → Deploy → Tool Directory
                 (.skill-manager/    (symlink)   (.claude/skills/
                  skills/<slug>/)                  .agents/skills/)
```

1. **Ingest** — Skills enter the system via `sm create`, `sm import`, `sm source add`, or auto-adopt. Each skill is stored in `~/.skill-manager/skills/<slug>/` with a `SKILL.md` file and `.sm-meta.json` metadata.

2. **Deploy** — `sm add <name>` reads the skill's metadata to determine the deploy format per tool, then creates a symlink from the tool's directory back to the canonical store. The deploy engine records the link in `state.json`.

3. **Activate** — When Claude Code or Codex CLI starts a session, the configured hook scans the project for trigger matches and auto-deploys relevant skills.

4. **Undeploy** — `sm remove <name>` removes the symlink and cleans up the state record. The skill remains in the canonical store for future use.

### Deploy Engine

The deploy engine (`src/deploy/engine.ts`) is the central orchestrator:

1. Reads `.sm-meta.json` to determine the deploy format for the target tool
2. Delegates to the matching strategy in `src/deploy/strategies/`
3. Records the symlink in `state.json` as a `LinkRecord`
4. Updates `lastDeployed` timestamp in `.sm-meta.json`
5. Records a version snapshot in `.sm-history.json`

## Key Concepts

### Canonical Store

All skills live in `~/.skill-manager/skills/<slug>/`. This is the single source of truth. Tool directories only contain symlinks pointing back here.

```
~/.skill-manager/skills/<slug>/
├── SKILL.md            # Skill content with YAML frontmatter
├── .sm-meta.json       # Metadata (format, source, deploy config, timestamps)
├── .sm-history.json    # Version history with content snapshots
└── references/         # Optional bundled resources
```

### Symlink Strategy

Three deployment formats create symlinks from tool directories to the canonical store:

| Format           | Link Type         | Target                            | Example                                      |
| ---------------- | ----------------- | --------------------------------- | -------------------------------------------- |
| `skill`          | Directory symlink | `~/.skill-manager/skills/<slug>/` | `~/.claude/skills/my-skill → canonical`      |
| `legacy-command` | File symlink      | `SKILL.md`                        | `~/.claude/commands/my-skill.md → canonical` |
| `legacy-prompt`  | File symlink      | `SKILL.md`                        | `~/.codex/prompts/my-skill.md → canonical`   |

All symlink operations use an atomic temp-then-rename pattern (`src/fs/links.ts`) to prevent partial writes.

### Tool Directories

| Tool        | Skill Format               | Legacy Format                  |
| ----------- | -------------------------- | ------------------------------ |
| Claude Code | `~/.claude/skills/<slug>/` | `~/.claude/commands/<slug>.md` |
| Codex CLI   | `~/.agents/skills/<slug>/` | `~/.codex/prompts/<slug>.md`   |

### Dependencies

Skills can declare dependencies in their YAML frontmatter:

```yaml
depends: [other-skill, lib-skill]
```

When deploying, dependencies are resolved in topological order with cycle detection. `sm remove` warns about deployed dependents.

### Triggers

Skills can declare file/directory triggers for automatic activation:

```yaml
triggers:
  files: ['Cargo.toml', '*.rs']
  dirs: ['.github']
```

`sm suggest` scans the current project (top 2 levels) and recommends matching skills ranked by confidence. The session-start hook uses triggers for automatic deployment.

### Versioning

Every deploy, edit, create, and import records a content-hash snapshot in `.sm-history.json`. `sm history <name>` shows the log, and `sm rollback <name> [version]` restores a previous version.

### Analytics

Usage tracking is built into the skill lifecycle:

- **`lastDeployed`** — Set each time a skill is deployed
- **`lastUsed` / `usageCount`** — Set when a skill is activated in a session
- **`sm analytics`** — Shows usage stats sorted by count
- **`sm doctor`** — Reports stale (not deployed recently) and unused skills

### Sources

Git repositories can be registered as remote skill sources:

```
sm source add <url>        # Register and clone a repo
sm source sync [name]      # Pull latest changes
sm source list             # Show registered sources
```

Repos are cloned to `~/.skill-manager/sources/<name>/` and scanned for skill directories and standalone `.md` files.

### Packs

Bundled starter packs provide curated collections of skills from specific repos. `sm pack install <name>` clones the referenced repos and imports matching skills.

## MCP Server

`sm mcp` starts an MCP server on stdio that exposes skill operations as tools. This allows Claude Code and Codex CLI to manage skills programmatically during conversations.

**9 tools:** `list_skills`, `get_skill`, `search_skills`, `deploy_skill`, `undeploy_skill`, `suggest_skills`, `get_analytics`, `list_sources`, `sync_source`

**2 resources:** `skill://{slug}` (raw markdown), `skill-catalog://all` (JSON catalog)

Setup: `sm mcp setup` registers the server in Claude Code and/or Codex CLI.

## TUI

The terminal UI (`sm` with no arguments) provides an interactive interface with 7 screens:

| Screen    | Purpose                             | Navigation           |
| --------- | ----------------------------------- | -------------------- |
| Dashboard | Overview of skills, deploy status   | Entry point          |
| Browser   | Search and filter skills            | `/` to search        |
| Detail    | View skill content, deploy/undeploy | `Enter` from Browser |
| Import    | Import skills from files            | `i` from Dashboard   |
| Profiles  | Save/restore deployment profiles    | `p` from Dashboard   |
| Sync      | View sync operation results         | After sync           |
| Sources   | Manage remote skill sources         | `r` from Dashboard   |

Navigation: `j/k` or arrows to move, `Enter` to select, `Esc` to go back, `q` to quit.
