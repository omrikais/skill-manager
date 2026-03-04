# Skill Manager (`sm`)

A unified tool for managing skills (instruction files) across **Claude Code** and **Codex CLI**. Instead of maintaining duplicate files in `~/.claude/commands/`, `~/.codex/prompts/`, and `~/.agents/skills/`, Skill Manager keeps a single canonical copy of each skill and deploys symlinks to wherever each tool expects them. Edit once, reflected everywhere.

## Features

- **Canonical store** — All skills live in `~/.skill-manager/skills/`, organized as directories with `SKILL.md` files and metadata
- **Symlink deployment** — Atomic symlinks into each tool's native directories; no files are duplicated
- **Automatic deduplication** — Import detects identical files across tools and merges them
- **Interactive TUI** — Fullscreen terminal UI (alternate screen buffer) for browsing, deploying, and managing skills with multi-select bulk operations and diff previews
- **Project manifests** — Declare which skills a project needs via `.skills.json`
- **Profiles** — Named sets of skills you can apply at once
- **Health checks** — Validate and repair all symlinks with `sm doctor` and `sm sync --repair`
- **Backups** — Timestamped snapshots before any destructive operation
- **Version history** — Content snapshots on every edit, deploy, and import; rollback to any version
- **Dependency resolution** — Declare `depends` in frontmatter; `sm add` auto-deploys prerequisites in topological order
- **Context-aware suggestions** — Declare `triggers` in frontmatter; `sm suggest` recommends skills based on project files
- **Automatic session activation** — Hook into Claude Code's `SessionStart` event to auto-deploy matching skills with full dependency resolution
- **Usage analytics** — Track per-skill usage counts and last-used timestamps; `sm analytics` shows a ranked usage table
- **Remote sources** — Add git repositories as skill sources; browse, sync, and install remote skills
- **Skill publishing** — Export skills to portable directories for sharing via git
- **Starter packs** — Install curated bundles of skills from predefined packs
- **MCP server** — Expose skill operations as MCP tools so Claude Code and Codex can discover, search, deploy, and read skills programmatically during a session
- **Auto-adopt** — Detect skills manually placed in tool directories and automatically import them into the canonical store with symlink replacement

## Requirements

- Node.js 20+
- macOS or Linux

## Installation

```bash
git clone <repo-url> && cd skill-manager
npm install
npm run build
npm link
```

This makes the `sm` command available globally.

## Quick Start

### 1. Import your existing skills

```bash
# Preview what would be imported
sm import --dry-run

# Run the import — backs up originals, creates canonical store, rewires symlinks
sm import
```

This scans four directories:

- `~/.claude/commands/` (Claude Code legacy commands)
- `~/.codex/prompts/` (Codex CLI legacy prompts)
- `~/.agents/skills/` (Codex skills)
- `~/.codex/skills/` (Codex skills, legacy)

Identical files are deduplicated automatically. Originals are replaced with symlinks pointing back to the canonical store.

**Note**: Skill Manager also automatically detects and imports unmanaged skills placed directly in any tool directory at any time. See "Auto-Adopt" below.

### 2. Check health

```bash
sm doctor
```

### 3. Browse your skills

```bash
# List all skills with deployment status
sm list

# List with format and tag details
sm list --status

# Search by name, description, or tags
sm search python
```

### 4. Launch the TUI

```bash
sm
```

## CLI Reference

### Core Commands

| Command                               | Description                                          |
| ------------------------------------- | ---------------------------------------------------- |
| `sm`                                  | Launch the interactive TUI                           |
| `sm list [--cc] [--codex] [--status]` | List skills with deployment indicators               |
| `sm info <name>`                      | Show detailed skill information                      |
| `sm search <query>`                   | Search skills by name, description, tags, or content |

### Deployment

| Command                                                 | Description                                    |
| ------------------------------------------------------- | ---------------------------------------------- |
| `sm add <name> [--cc] [--codex] [--all] [--no-deps]`    | Deploy a skill to one or both tools            |
| `sm remove <name> [--cc] [--codex] [--purge] [--force]` | Undeploy a skill; `--purge` deletes from store |

Without flags, `add` and `remove` target both tools. `add` auto-deploys dependencies unless `--no-deps` is set. `remove` warns about deployed dependents unless `--force` is set.

### Import & Migration

| Command                                         | Description                                               |
| ----------------------------------------------- | --------------------------------------------------------- |
| `sm import [--from all\|cc\|codex] [--dry-run]` | Import existing skills into canonical store               |
| `sm convert <name>`                             | Convert a legacy-format skill to the new directory format |

### Maintenance

| Command                          | Description                                                                     |
| -------------------------------- | ------------------------------------------------------------------------------- |
| `sm sync [--dry-run] [--repair]` | Validate all symlinks; repair broken ones                                       |
| `sm doctor`                      | Full health check (symlinks, stale skills, unused skills, dependency integrity) |
| `sm backup`                      | Create a timestamped backup                                                     |
| `sm restore <id>`                | Restore from a backup                                                           |
| `sm backups`                     | List available backups                                                          |

### Skill Authoring

| Command                                     | Description                                         |
| ------------------------------------------- | --------------------------------------------------- |
| `sm create <name> [--template basic\|full]` | Scaffold a new skill                                |
| `sm edit <name>`                            | Open a skill in `$EDITOR`                           |
| `sm history <name>`                         | Show version history (version, date, hash, message) |
| `sm rollback <name> [version]`              | Restore a previous version (defaults to latest - 1) |

### Intelligence

| Command               | Description                                                      |
| --------------------- | ---------------------------------------------------------------- |
| `sm suggest`          | Recommend skills for the current project based on triggers       |
| `sm suggest --apply`  | Auto-deploy matching skills                                      |
| `sm suggest --json`   | Output suggestions as JSON                                       |
| `sm analytics`        | Show usage stats for all skills (uses, last used, last deployed) |
| `sm analytics --json` | Output usage stats as JSON                                       |

### Hooks

| Command                    | Description                                             |
| -------------------------- | ------------------------------------------------------- |
| `sm hooks setup`           | Configure Claude Code `SessionStart` hook (global)      |
| `sm hooks setup --project` | Configure hook for current project only                 |
| `sm hooks run <event>`     | Execute a hook event (called by Claude Code, not users) |

### MCP Server

| Command                                                                   | Description                                              |
| ------------------------------------------------------------------------- | -------------------------------------------------------- |
| `sm mcp`                                                                  | Start the MCP server (stdio transport, used by AI tools) |
| `sm mcp setup [--tool cc\|codex\|all] [--scope user\|project\|local]`     | Register the MCP server in Claude Code and/or Codex CLI  |
| `sm mcp uninstall [--tool cc\|codex\|all] [--scope user\|project\|local]` | Remove the MCP server from Claude Code and/or Codex CLI  |

### Install

| Command                                            | Description                                                 |
| -------------------------------------------------- | ----------------------------------------------------------- |
| `sm install [--profile <name>]`                    | Deploy skills from the project `.skills.json` manifest      |
| `sm install <url> [slugs...]`                      | Install skills from a git URL, optionally filtering by slug |
| `sm install <user/repo> [slugs...]`                | Install from GitHub shorthand                               |
| `sm install npx <tool> add <user/repo> [slugs...]` | Paste any external install command                          |
| `sm install ... --force`                           | Update existing skills without prompting                    |

When installing skills that already exist locally, `sm install` compares content hashes. Identical skills are skipped. Changed skills prompt for confirmation (or auto-update with `--force`). In non-interactive environments (piped stdin), changed skills are skipped by default.

### Project Manifests

| Command                    | Description                                      |
| -------------------------- | ------------------------------------------------ |
| `sm init [--from-current]` | Create a `.skills.json` in the current directory |

### Profiles

| Command                    | Description                          |
| -------------------------- | ------------------------------------ |
| `sm profile list`          | List all profiles                    |
| `sm profile create <name>` | Create a profile from current skills |
| `sm profile apply <name>`  | Deploy all skills in a profile       |
| `sm profile delete <name>` | Delete a profile                     |

### Sources

| Command                             | Description                                                      |
| ----------------------------------- | ---------------------------------------------------------------- |
| `sm source add <url> [--install]`   | Add a git repo as a skill source; `--install` imports all skills |
| `sm source list [--json]`           | List configured sources with skill counts and sync status        |
| `sm source sync [name]`             | Pull updates from one or all sources                             |
| `sm source remove <name> [--purge]` | Remove a source; `--purge` deletes the cloned repo               |

### Publishing

| Command                                       | Description                                                    |
| --------------------------------------------- | -------------------------------------------------------------- |
| `sm publish <name> --out <dir> [--overwrite]` | Export a skill to a portable directory (SKILL.md + references) |

### Packs

| Command                              | Description                                                          |
| ------------------------------------ | -------------------------------------------------------------------- |
| `sm pack list [--json]`              | List available starter packs                                         |
| `sm pack install <name> [--dry-run]` | Install a curated skill pack (clones repos, imports matching skills) |

## TUI Navigation

The TUI runs in fullscreen mode (alternate screen buffer). Prior terminal output is hidden while the TUI is active and restored on exit. All list heights adjust dynamically to the terminal size.

| Key               | Action                                                                                                         |
| ----------------- | -------------------------------------------------------------------------------------------------------------- |
| `j`/`k` or arrows | Navigate lists                                                                                                 |
| `Enter`           | Select / open detail                                                                                           |
| `/`               | Search (Dashboard and Browser)                                                                                 |
| `f`               | Cycle filter (in Browser): all, cc, codex, project, undeployed, remote                                         |
| `Tab`             | Switch active scope in Detail (`User` ↔ `Project`)                                                             |
| `u` / `p`         | Set active scope to `User` / `Project` in Detail                                                               |
| `c` / `x`         | Toggle CC / Codex deployment in the active scope (Detail)                                                      |
| `a`               | Browse skills (Dashboard) / deploy both tools (Detail) / deploy selected (Browser bulk) / add source (Sources) |
| `r`               | Open Sources screen (Dashboard) / remove both tools (Detail) / undeploy selected (Browser bulk)                |
| `s`               | Sync (Dashboard → Sync screen, Sources → sync selected source)                                                 |
| `m` / `M`         | MCP setup / uninstall (Dashboard)                                                                              |
| `Space`           | Toggle multi-select on current skill (Browser)                                                                 |
| `d`               | Delete skill permanently (Detail) / view diff (Sources detail) / remove source (Sources list)                  |
| `D`               | Delete skill(s) (Browser — single or bulk with confirmation)                                                   |
| `i` / `I`         | Install or update selected / install and update all (Sources detail)                                           |
| `?`               | Show key reference overlay (any screen)                                                                        |
| `Esc`             | Clear selection (Browser, when items selected) / go back / clear search                                        |
| `q`               | Quit (from Dashboard)                                                                                          |

### Bulk Operations (Browser)

The Browser screen supports multi-select for batch operations. Press `Space` to toggle selection on the current skill — selected items show a `◼` checkbox indicator alongside the cursor. The Divider displays a selection count (e.g., `3 selected · 12/43`).

When one or more skills are selected:

| Key   | Action                                                     |
| ----- | ---------------------------------------------------------- |
| `a`   | Deploy all selected to CC + Codex (user scope)             |
| `r`   | Undeploy all selected from CC + Codex                      |
| `D`   | Delete all selected permanently (with confirmation dialog) |
| `Esc` | Clear selection                                            |

After each bulk action, a status message reports results (e.g., `Deployed 3 skills to CC + Codex` or `Undeployed 2 skills from CC + Codex; 1 already undeployed`). Selection is cleared and the skill list refreshes automatically.

Detail view and list rows always show both scopes explicitly:

- `User: CC on/off, Codex on/off`
- `Project: CC on/off, Codex on/off` (current working directory)

## How It Works

### Canonical Store

Every skill lives in `~/.skill-manager/skills/<slug>/`:

```
~/.skill-manager/skills/commit/
├── SKILL.md            # Skill content (markdown with YAML frontmatter)
├── .sm-meta.json       # Metadata: source, deploy format, tags, lastDeployed, lastUsed, usageCount
├── .sm-history.json    # Version history with content snapshots (auto-managed)
└── references/         # Optional bundled resources
```

### Symlink Deployment

The `deployAs` field in `.sm-meta.json` controls how each skill is exposed to each tool:

| Format           | Link created                   | Points to                  |
| ---------------- | ------------------------------ | -------------------------- |
| `legacy-command` | `~/.claude/commands/<slug>.md` | `SKILL.md` (file link)     |
| `legacy-prompt`  | `~/.codex/prompts/<slug>.md`   | `SKILL.md` (file link)     |
| `skill` (CC)     | `~/.claude/skills/<slug>/`     | skill directory (dir link) |
| `skill` (Codex)  | `~/.agents/skills/<slug>/`     | skill directory (dir link) |
| `none`           | —                              | not deployed to that tool  |

All symlink operations are atomic (create temp link, then rename).

### State Tracking

`~/.skill-manager/state.json` records every deployed link — slug, tool, format, link path, and target path. Commands like `sync` and `doctor` validate these records against the actual filesystem.

## Project Manifest

Create a `.skills.json` to declare which skills a project needs:

```json
{
  "version": 1,
  "skills": [
    { "name": "commit", "tools": ["cc", "codex"], "scope": "user" },
    { "name": "api-expert", "tools": ["cc"], "scope": "project" }
  ],
  "profiles": {
    "python-dev": {
      "description": "Python development skills",
      "skills": [{ "name": "py-testing-async", "scope": "project" }]
    }
  },
  "activeProfile": "python-dev"
}
```

- **`scope: "user"`** — Deploys to user-level tool directories (`~/.claude/skills/`, `~/.agents/skills/`)
- **`scope: "project"`** — Deploys to project-local directories (`.claude/skills/`, `.agents/skills/`)

Run `sm install` in the project directory to deploy everything.

## Version History

Every skill automatically tracks content snapshots. A new version is recorded when content changes during `sm create`, `sm edit`, `sm import`, or `sm add`. No version is recorded if the content hasn't changed since the last snapshot.

```bash
# View version log
sm history commit
#  v1    2025-01-15 10:30:00  a1b2c3d4  initial
#  v2    2025-01-16 14:20:00  e5f6g7h8  edited
#  v3    2025-01-17 09:00:00  a1b2c3d4  rollback to v1  ← current

# Rollback to a specific version
sm rollback commit 1

# Rollback to the previous version
sm rollback commit
```

Rollback restores the `SKILL.md` content and records a new forward version entry (history is append-only).

## Dependencies

Skills can declare dependencies on other skills via `depends` in YAML frontmatter:

```yaml
---
name: 'API Testing'
description: 'Tools for testing REST APIs'
depends: [http-client, json-validator]
---
```

When you deploy a skill with dependencies, they are automatically deployed first in the correct order:

```bash
sm add api-testing
# ✓ Deployed dependency: http-client to cc (skill)
# ✓ Deployed dependency: json-validator to cc (skill)
# ✓ Deployed api-testing to cc (skill)
```

Circular dependencies are detected and reported as errors. Removing a skill that others depend on shows a warning:

```bash
sm remove http-client
# ⚠ These deployed skills depend on http-client: api-testing
#   Use --force to remove anyway.
```

`sm doctor` validates that all deployed dependencies are satisfied. `sm info <name>` shows both dependencies and reverse dependents.

## Context-Aware Suggestions

Skills can declare file and directory patterns that indicate when they're useful:

```yaml
---
name: 'Rust Helper'
description: 'Assists with Rust development'
triggers:
  files: ['Cargo.toml', '*.rs']
  dirs: ['.cargo']
---
```

Run `sm suggest` in any project directory to get recommendations:

```bash
cd ~/projects/my-rust-app
sm suggest
# [high]   Rust Helper
#          Assists with Rust development
#          Matched: Cargo.toml, *.rs

# Auto-deploy all suggestions
sm suggest --apply

# Machine-readable output
sm suggest --json
```

Confidence levels are based on the ratio of matched triggers: high (75%+), medium (33%+), low (<33%).

## Automatic Session Activation

Instead of running `sm suggest --apply` manually, you can hook into Claude Code's session startup to auto-activate relevant skills:

```bash
# Set up the global hook (one-time)
sm hooks setup

# Or set up for a specific project
sm hooks setup --project
```

This adds a `SessionStart` hook to Claude Code's settings. When a new session starts, Skill Manager:

1. Scans the project directory for file/directory signals
2. Matches against all skills with declared `triggers`
3. Auto-deploys matching skills that aren't already active — with full dependency resolution
4. Records usage for successfully activated skills
5. Outputs a summary of activated skills to the session context

Dependencies are resolved per-tool: if a dependency can't deploy to a specific tool (e.g., `deployAs.cc = 'none'`), the parent skill is skipped for that tool but may still deploy to others.

## Auto-Adopt

Skill Manager automatically detects and imports any unmanaged skills you place directly in tool directories. No manual `sm import` needed — the system works seamlessly in the background.

### How It Works

If you manually create a skill file or directory in any tool location:

- `~/.claude/commands/my-skill.md` — a legacy command
- `~/.claude/skills/my-skill/SKILL.md` — a CC skill directory
- `~/.codex/prompts/my-prompt.md` — a Codex legacy prompt
- `~/.agents/skills/my-skill/SKILL.md` — an Agents skill directory
- `.claude/skills/my-skill/` or `.agents/skills/my-skill/` — project-level skills

Skill Manager automatically:

1. Detects the unmanaged skill (scans on every CLI command, TUI startup, and MCP tool invocation)
2. Imports it into `~/.skill-manager/skills/` with source metadata `'adopted'`
3. Removes the original file/directory
4. Deploys a symlink back to the canonical location
5. For directory skills, copies extra files (`references/`, companion files) to the store
6. Handles slug conflicts by appending numeric suffixes (`my-skill-2`, `my-skill-3`)

### Configuration

Auto-adopt is enabled by default. To disable it:

```toml
# ~/.skill-manager/config.toml
autoAdopt = false
```

### Performance

- Auto-adopt runs with a 10-second debounce to avoid excessive scanning
- Runs automatically before each CLI command (except `completion`, `mcp`, and TUI)
- Runs on TUI startup to catch any skills added since last session
- Runs before each MCP tool invocation
- Per-skill error handling — failures don't block other operations or the command itself
- All scanning and import/deploy operations fail gracefully in silent mode (TUI/MCP)

### Usage Examples

**Manually create a skill directory, then auto-adopt captures it:**

```bash
# Create a skill directory manually
mkdir -p ~/.claude/skills/my-utility
cat > ~/.claude/skills/my-utility/SKILL.md << 'EOF'
---
name: "My Utility"
description: "Helper skill"
tags: [utility]
---

# My Utility Skill
...
EOF

# Run any sm command — auto-adopt runs first
sm list
# → Info: Auto-adopted 1 skill(s): my-utility
# → The original directory is replaced with a symlink
# → The skill is imported into ~/.skill-manager/skills/my-utility/
```

**Project-level skill auto-adoption:**

```bash
# Create a project-level skill
mkdir -p .claude/skills/project-helper
cat > .claude/skills/project-helper/SKILL.md << 'EOF'
---
name: "Project Helper"
description: "Project-specific automation"
---

...
EOF

# Run sm in the project directory
sm suggest
# → Info: Auto-adopted 1 skill(s): project-helper
# → Symlink created in .claude/skills/project-helper/
```

## Usage Analytics

Track which skills are actually being used across sessions:

```bash
# View usage table
sm analytics
# Skill                         Uses  Last Used     Last Deployed
# rust-helper                      5  2/15/2026     2/10/2026
# python-helper                    2  2/12/2026     2/1/2026
# ...
#
#   Unused skills (not used in 30+ days)
#     old-unused-skill

# Machine-readable output
sm analytics --json
```

Usage is tracked automatically by session hooks. `sm doctor` also reports unused skills (not used in 30+ days) as an informational check. `sm info <name>` shows per-skill usage stats.

## Remote Sources

Add git repositories as skill sources to discover and install skills shared by others:

```bash
# Add a source (clones the repo)
sm source add https://github.com/team/shared-skills.git

# Add and install all skills immediately
sm source add https://github.com/team/shared-skills.git --install

# Install specific skills from a source using GitHub shorthand
sm install user/repo my-skill other-skill

# Paste an external tool's install command — sm extracts the repo and skill info
sm install npx skillfish add user/repo render-output

# Force-update skills that have changed since last install
sm install user/repo my-skill --force

# List configured sources
sm source list

# Pull updates from all sources
sm source sync

# Pull updates from one source
sm source sync shared-skills

# Remove a source (keeps cloned repo by default)
sm source remove shared-skills

# Remove and delete the cloned repo
sm source remove shared-skills --purge
```

Source repositories are cloned to `~/.skill-manager/sources/` and tracked in `~/.skill-manager/sources.json`. Each repo is scanned for skill directories (containing `SKILL.md`) and standalone `.md` files.

### Selective Install

When slugs are specified after the repo reference, only those skills are installed:

```bash
# Install only render-output from the repo (not all skills)
sm install user/claude-config render-output

# Install multiple specific skills
sm install https://github.com/team/skills.git skill-a skill-b
```

If a requested slug doesn't exist in the repo, `sm install` lists the available skills and exits with an error.

### Update Detection

When installing a skill that already exists locally, `sm install` compares SHA-256 content hashes:

- **Identical** — Skipped with "(up to date)" message
- **Changed** — Prompts for confirmation: `"slug" has changed. Update? [y/N]`
- **`--force`** — Updates without prompting
- **Non-TTY** — Defaults to skip (safe for CI/scripts)

### TUI Sources Screen

The TUI Sources screen (`r` from Dashboard) provides a visual interface for browsing sources and installing individual skills. The "Add Source" input (`a`) accepts all formats: full git URLs, GitHub shorthand (`user/repo`), shorthand with slugs (`user/repo skill-name`), or pasted install commands (`npx tool add user/repo skill-name`).

Pressing `i` on an installed skill checks for content changes and prompts before updating. Pressing `d` on an installed skill shows a unified diff view (local vs remote) with green/red line coloring — scroll with `j/k`, accept the update with `y`, or go back with `Esc`. The diff is also accessible from the update confirmation prompt. Pressing `I` installs all new skills and updates all changed skills.

`sm doctor` reports source health: missing cloned directories, last sync errors, and sources not synced in 30+ days.

## Skill Publishing

Export a skill to a portable directory for sharing via git or file transfer:

```bash
# Export to a directory
sm publish my-skill --out /path/to/shared-repo

# Overwrite existing export
sm publish my-skill --out /path/to/shared-repo --overwrite
```

This copies `SKILL.md` and `references/` but strips internal metadata (`.sm-meta.json`, `.sm-history.json`). The exported directory can be committed to a git repo and shared as a source.

## Starter Packs

Packs are curated bundles of skills from predefined repositories. They provide a quick way to set up a skill collection for a specific domain:

```bash
# List available packs
sm pack list

# Preview what a pack would install
sm pack install anthropic-official --dry-run

# Install a pack (clones repos, imports skills, deploys to CC + Codex)
sm pack install anthropic-official
```

Built-in packs:

| Pack                 | Description                                                |
| -------------------- | ---------------------------------------------------------- |
| `anthropic-official` | Curated skills from Anthropic's official skills repository |

Pack definitions live in `packs/*.json` and reference skills by slug and source repository URL. Installing a pack automatically adds the referenced repos as sources.

## MCP Server

Skill Manager includes a built-in [Model Context Protocol](https://modelcontextprotocol.io/) server that lets Claude Code and Codex CLI interact with your skills programmatically. Instead of switching to a terminal to run `sm` commands, the AI assistant can search for skills, deploy them, and read their content — all within the conversation.

### Setup

```bash
# Register the MCP server in both Claude Code and Codex CLI
sm mcp setup

# Register in Claude Code only
sm mcp setup --tool cc

# Register in Codex CLI only
sm mcp setup --tool codex

# Register at project scope (writes .mcp.json)
sm mcp setup --scope project
```

If the `claude` or `codex` CLI isn't available, setup prints the manual configuration you can paste into your config files.

**Claude Code** (JSON — `.mcp.json` or via `claude mcp add`):

```json
{
  "mcpServers": {
    "sm-skills": {
      "command": "sm",
      "args": ["mcp"]
    }
  }
}
```

**Codex CLI** (TOML — `~/.codex/config.toml`):

```toml
[mcp_servers.sm-skills]
command = "sm"
args = ["mcp"]
```

### Available Tools

Once registered, the AI assistant gains access to these tools:

| Tool             | Description                                                                         |
| ---------------- | ----------------------------------------------------------------------------------- |
| `list_skills`    | List all managed skills, optionally filtered by tag or deployment status            |
| `get_skill`      | Read a skill's full markdown content, metadata, and file listing                    |
| `search_skills`  | Search skills by name, description, tags, or content body                           |
| `deploy_skill`   | Deploy a skill to Claude Code and/or Codex CLI with automatic dependency resolution |
| `undeploy_skill` | Remove a skill deployment, with dependent safety checks                             |
| `suggest_skills` | Get trigger-based skill suggestions for a project directory                         |
| `get_analytics`  | View usage statistics, stale skills, and unused skills                              |
| `list_sources`   | List configured remote skill sources with sync status                               |
| `sync_source`    | Sync one or all remote skill sources (git pull + rescan)                            |

### Available Resources

| Resource URI          | Description                                                |
| --------------------- | ---------------------------------------------------------- |
| `skill://{slug}`      | Raw markdown content of a specific skill                   |
| `skill-catalog://all` | JSON catalog of all skills (slug, name, description, tags) |

### Example Usage

With the MCP server registered, you can ask your AI assistant things like:

- _"What skills do I have for Python development?"_ — triggers `search_skills`
- _"Deploy the rust-helper skill"_ — triggers `deploy_skill`
- _"What skills would be useful for this project?"_ — triggers `suggest_skills`
- _"Show me the content of the commit skill"_ — triggers `get_skill` or reads `skill://commit`
- _"Which skills haven't I used recently?"_ — triggers `get_analytics`
- _"What remote sources do I have configured?"_ — triggers `list_sources`
- _"Sync my skill sources"_ — triggers `sync_source`

## Configuration

Optional config at `~/.skill-manager/config.toml`:

```toml
defaultTools = ["cc", "codex"]
autoSync = true
autoAdopt = true           # auto-detect and import unmanaged skills (default: true)
logLevel = "info"          # debug | info | warn | error
# editor = "code"          # override $EDITOR
```

**Config options:**

- `defaultTools` — Which tools to target by default in `add` and `remove` commands
- `autoSync` — Sync remote sources on `sm import`
- `autoAdopt` — Automatically detect and adopt unmanaged skills from tool directories
- `logLevel` — Verbosity level for logging

## Development

```bash
npm run build              # Build with tsup
npm run dev                # Watch mode
npm run lint               # Type check
npm test                   # Run tests
```

The project uses TypeScript with ESM modules, built by `tsup`, with Ink v6 (React 19) for the TUI.

## Security

**Remote sources clone arbitrary repositories.** When you run `sm source add <url>`, the URL is cloned via `git` with no sandboxing or allowlist. Only add sources you trust. A malicious repository could contain files that, once imported as skills, execute arbitrary instructions in your AI-assisted coding sessions. Review imported skills before deploying them.

**Editor launch.** `sm edit` and the TUI editor launch use `execFileSync` to open your configured `$EDITOR` without invoking a shell, preventing shell injection via the `EDITOR` environment variable.

## Troubleshooting

**`git` not found when adding sources or installing packs**

`sm source add` and `sm pack install` require `git` to clone repositories. If you see an error like `git exited with status 1` or `spawn git ENOENT`, install git from [git-scm.com](https://git-scm.com/) and ensure it's on your `PATH`.

**Permission errors (`EACCES`) on `~/.skill-manager/`**

If commands fail with `EACCES` when reading or writing to the canonical store, fix ownership:

```bash
sudo chown -R "$(whoami)" ~/.skill-manager
```

**Symlinks don't work on Windows**

On Windows, symlinks require Developer Mode to be enabled or an elevated terminal. Go to Settings > Developer Settings > Enable Developer Mode. If you can't enable Developer Mode, `sm` will not work correctly on Windows.

**Skills not appearing after deploy**

Run `sm doctor` to check for broken symlinks and verify deployment state. Ensure the target tool (Claude Code or Codex CLI) is reading from the correct directory — Claude Code uses `~/.claude/skills/`, Codex uses `~/.agents/skills/`. Legacy formats deploy to `~/.claude/commands/` and `~/.codex/prompts/` respectively.

**`sm pack install` fails to clone a repository**

Verify the pack's repository URL is accessible (`git ls-remote <url>`). If the repo requires authentication, ensure your git credentials are configured. As a workaround, add the repo directly with `sm source add <url>` to see the specific git error.

## License

MIT
