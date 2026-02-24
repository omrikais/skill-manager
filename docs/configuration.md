# Configuration Reference

## Config File

Location: `~/.skill-manager/config.toml`

Created automatically with defaults on first run. Edit manually or let `sm` manage it.

```toml
defaultTools = ["cc", "codex"]
autoSync = true
autoAdopt = true
logLevel = "info"
# editor = "code"
```

### Options

| Option         | Type     | Default           | Description                                                                                                                            |
| -------------- | -------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `editor`       | string   | (unset)           | Editor command for `sm edit`. Overrides `$EDITOR` and `$VISUAL` env vars. Example: `"code --wait"`, `"nvim"`                           |
| `defaultTools` | string[] | `["cc", "codex"]` | Target tools for deploy operations. Valid values: `"cc"` (Claude Code), `"codex"` (Codex CLI)                                          |
| `autoSync`     | boolean  | `true`            | Automatically sync remote sources on CLI startup                                                                                       |
| `autoAdopt`    | boolean  | `true`            | Auto-detect and import unmanaged skills from tool directories (e.g., skills placed directly in `~/.claude/skills/` without using `sm`) |
| `logLevel`     | string   | `"info"`          | Log verbosity. One of: `"debug"`, `"info"`, `"warn"`, `"error"`                                                                        |

## Environment Variables

| Variable       | Description                                                                                                       |
| -------------- | ----------------------------------------------------------------------------------------------------------------- |
| `SM_HOME`      | Override the skill manager home directory. Default: `~/.skill-manager/`                                           |
| `SM_TEST_HOME` | Override the home directory used for path resolution (used in testing to isolate `~/.claude/`, `~/.codex/`, etc.) |
| `EDITOR`       | Preferred editor for `sm edit`. Checked after config `editor` option                                              |
| `VISUAL`       | Fallback editor if `EDITOR` is not set. Checked after `EDITOR`                                                    |

**Editor resolution order:** config `editor` → `$EDITOR` → `$VISUAL` → `vi` (Unix) / `notepad` (Windows)

## File Locations

All paths are defined in `src/fs/paths.ts` and respect `SM_HOME` overrides.

### Global Paths

| Path                            | Description                             |
| ------------------------------- | --------------------------------------- |
| `~/.skill-manager/`             | Skill manager home directory            |
| `~/.skill-manager/skills/`      | Canonical skill store                   |
| `~/.skill-manager/config.toml`  | User configuration                      |
| `~/.skill-manager/state.json`   | Deploy state (link records, timestamps) |
| `~/.skill-manager/sources.json` | Remote source registry                  |
| `~/.skill-manager/sources/`     | Cloned source repositories              |
| `~/.skill-manager/profiles/`    | Saved deployment profiles               |
| `~/.skill-manager/backups/`     | Skill store backups                     |
| `~/.skill-manager/logs/`        | Log directory                           |

### Tool Directories

| Path                  | Tool        | Format                           |
| --------------------- | ----------- | -------------------------------- |
| `~/.claude/skills/`   | Claude Code | `skill` (directory symlinks)     |
| `~/.claude/commands/` | Claude Code | `legacy-command` (file symlinks) |
| `~/.agents/skills/`   | Codex CLI   | `skill` (directory symlinks)     |
| `~/.codex/prompts/`   | Codex CLI   | `legacy-prompt` (file symlinks)  |
| `~/.codex/skills/`    | Codex CLI   | Legacy scan-only (deprecated)    |

### Project-Level Paths

| Path              | Description                       |
| ----------------- | --------------------------------- |
| `.claude/skills/` | Project-scoped Claude Code skills |
| `.agents/skills/` | Project-scoped Codex CLI skills   |
| `.skills.json`    | Project skill manifest            |

## State File

Location: `~/.skill-manager/state.json`

Tracks all deployed symlinks and operational timestamps.

```json
{
  "version": 1,
  "links": [
    {
      "slug": "my-skill",
      "tool": "cc",
      "format": "skill",
      "linkPath": "/Users/me/.claude/skills/my-skill",
      "targetPath": "/Users/me/.skill-manager/skills/my-skill",
      "createdAt": "2025-01-15T10:30:00.000Z",
      "scope": "user"
    }
  ],
  "lastSync": "2025-01-15T10:30:00.000Z",
  "lastImport": "2025-01-15T10:00:00.000Z",
  "lastAdoptScan": "2025-01-15T10:30:00.000Z"
}
```

### Link Record Fields

| Field         | Type                                                 | Description                                         |
| ------------- | ---------------------------------------------------- | --------------------------------------------------- |
| `slug`        | string                                               | Skill identifier                                    |
| `tool`        | `"cc"` \| `"codex"`                                  | Target tool                                         |
| `format`      | `"skill"` \| `"legacy-command"` \| `"legacy-prompt"` | Deploy format                                       |
| `linkPath`    | string                                               | Absolute path of the symlink                        |
| `targetPath`  | string                                               | Absolute path of the symlink target                 |
| `createdAt`   | string                                               | ISO 8601 timestamp                                  |
| `scope`       | `"user"` \| `"project"`                              | Deploy scope (optional, defaults to `"user"`)       |
| `projectRoot` | string                                               | Project root path (only for project-scoped deploys) |

### State Timestamps

| Field           | Description                               |
| --------------- | ----------------------------------------- |
| `lastSync`      | Last time remote sources were synced      |
| `lastImport`    | Last time skills were imported            |
| `lastAdoptScan` | Last auto-adopt scan (10-second debounce) |

## Per-Skill Metadata

Location: `~/.skill-manager/skills/<slug>/.sm-meta.json`

```json
{
  "format": "skill",
  "source": {
    "type": "imported",
    "importedFrom": "/path/to/original"
  },
  "tags": ["utility", "testing"],
  "deployAs": {
    "cc": "skill",
    "codex": "skill"
  },
  "createdAt": "2025-01-15T10:00:00.000Z",
  "updatedAt": "2025-01-15T10:30:00.000Z",
  "lastDeployed": "2025-01-15T10:30:00.000Z",
  "lastUsed": "2025-01-15T12:00:00.000Z",
  "usageCount": 5
}
```

### Meta Fields

| Field                 | Type                                                  | Description                                   |
| --------------------- | ----------------------------------------------------- | --------------------------------------------- |
| `format`              | `"skill"` \| `"legacy-command"` \| `"legacy-prompt"`  | Canonical format of this skill                |
| `originalFormat`      | string                                                | Format before conversion (if converted)       |
| `source.type`         | `"imported"` \| `"created"` \| `"git"` \| `"adopted"` | How the skill was added                       |
| `source.importedFrom` | string                                                | Original file path (for imports)              |
| `source.originalPath` | string                                                | Original path before adoption                 |
| `source.repo`         | string                                                | Source repository URL (for git sources)       |
| `tags`                | string[]                                              | Metadata tags for organization                |
| `deployAs.cc`         | `"skill"` \| `"legacy-command"` \| `"none"`           | Deploy format for Claude Code                 |
| `deployAs.codex`      | `"skill"` \| `"legacy-prompt"` \| `"none"`            | Deploy format for Codex CLI                   |
| `createdAt`           | string                                                | ISO 8601 creation timestamp                   |
| `updatedAt`           | string                                                | ISO 8601 last modification timestamp          |
| `lastDeployed`        | string                                                | ISO 8601 timestamp of last deploy             |
| `lastUsed`            | string                                                | ISO 8601 timestamp of last session activation |
| `usageCount`          | number                                                | Total number of session activations           |

## SKILL.md Frontmatter

Skills use YAML frontmatter for metadata that is part of the skill content itself:

```yaml
---
name: 'My Skill'
description: 'What this skill does'
version: '1.0.0'
tags: [utility, testing]
tools: [cc, codex]
depends: [other-skill, lib-skill]
triggers:
  files: ['Cargo.toml', '*.rs']
  dirs: ['.github']
---
```

| Field            | Type     | Description                                  |
| ---------------- | -------- | -------------------------------------------- |
| `name`           | string   | Display name                                 |
| `description`    | string   | Short description                            |
| `version`        | string   | Semantic version                             |
| `tags`           | string[] | Tags for categorization and search           |
| `tools`          | string[] | Target tools (`cc`, `codex`)                 |
| `depends`        | string[] | Slugs of required dependency skills          |
| `triggers.files` | string[] | File patterns that trigger auto-activation   |
| `triggers.dirs`  | string[] | Directory names that trigger auto-activation |

The frontmatter schema uses `.passthrough()`, so additional custom fields are preserved.
