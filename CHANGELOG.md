# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.0.2] - 2026-03-04

### Fixed

- Source scanner now discovers skills inside `.claude/`, `.codex/`, and `.agents/` directories in repos
- `sm remove` cleans up orphaned state records when the skill directory no longer exists
- `sm sync --repair` removes orphaned state records only when the target skill directory is truly missing

### Changed

- Source install imports skills to canonical store without auto-deploying to tool directories

## [1.0.1] - 2026-02-24

### Added

- Scope and tool targeting for Browse screen bulk operations (Tab to switch User/Project, c/x to toggle CC/Codex)
- Single-skill import from local path (`sm import /path/to/skill/`)
- Dark, light, and ANSI theme modes with automatic detection (`SM_TUI_THEME` env var or `COLORFGBG` heuristic)
- Terminal size guard shows warning when terminal is below 90x24 on Dashboard, Browser, Sources, and Generate screens

### Changed

- `q` now quits from any TUI screen, not just Dashboard
- Detail screen Esc navigates back to the previous screen instead of always Dashboard
- Dashboard help bar shows `p` (profiles) and `g` (generate) keys
- Import done step accepts Enter in addition to Esc
- Browser selection-mode Esc hint reads "clear selection" instead of "clear"
- Source confirm-update dialog shows `d` (view diff) key
- Help overlay on Sources screen filters bindings by active sub-step (including confirm-delete)
- Dashboard and Browser search help text documents manual filter behavior (type, Backspace, Enter, Esc)

### Fixed

- `sm import <path>` no longer ignores the path argument and falls through to full directory scan
- `.sm-meta.json` schema now accepts null `originalPath` for locally created skills
- Source list and detail views now show errors in red instead of always green
- `useDeployments` surfaces load errors instead of silently swallowing them
- Profile apply reports partial failures with warning/error colors
- Stale items in Sync screen use warning color instead of primary
- Generate screen config values use muted color for disabled options
- MCP uninstall spinner shows "Removing MCP server..." instead of the install label
- Prevent invalid `-1` selection index when navigating empty lists in TUI
- Raise `dim`, `border`, and `primary` color tokens to meet WCAG AA 4.5:1 contrast on black backgrounds
- Widen gap between `muted` (gray-300) and `dim` (gray-400) for better distinguishability
- Scope indicator in Detail view now shows explicit "User (active)" / "Project (active)" labels
- Replace hardcoded whitespace in scope alignment with flexGrow layout
- SkillList column headers use named constants tied to data row spacing
- Add +2 line padding to layout budgets across screens for HelpBar wrapping resilience
- Divider now truncates both left and right labels to guarantee single-line fit at any terminal width
- Dashboard HelpBar shows `m/M` shortcut for MCP setup/remove
- Source list now uses windowed scrolling with scroll indicators instead of rendering all items
- SyncResultsScreen caps each section to fit the viewport with "… and N more" overflow text
- Truncate all unbounded message and tag lines across Dashboard, Detail, Profiles, Sources, and Sync screens
- Consolidate local truncation helpers into shared `truncate()` utility
- Prevent concurrent operations in SourcesScreen via synchronous ref guard
- Guard async hooks (useSkills, useDeployments, useSources) against state updates on unmounted components
- Profile apply now shows a spinner and blocks input until the operation completes
- Source delete (`D`) now shows a confirmation dialog before removing
- Profiles empty state shows clearer guidance with copyable CLI command
- Remove hardcoded `issues=0` from StatusBar to avoid misleading display
- Disable action hotkeys while terminal-size warning is shown on Dashboard, Browser, Sources, and Generate screens
- Sources "already up to date" message no longer renders in error color after a prior failure

## [1.0.0] - 2026-02-24

### Added

- Canonical skill store at `~/.skill-manager/skills/` with symlink deployment
- Atomic symlink deployment to Claude Code and Codex CLI directories
- Automatic deduplication on import
- Interactive fullscreen TUI with 7 screens (Dashboard, Browser, Detail, Import, Profiles, Sync, Sources)
- Bulk operations in TUI Browser (multi-select deploy, undeploy, delete)
- Project manifests (`.skills.json`) for declaring per-project skill requirements
- Named profiles for skill sets
- Health checks (`sm doctor`) and symlink repair (`sm sync --repair`)
- Timestamped backups and restore
- Per-skill version history with content snapshots and rollback
- Dependency resolution with topological ordering and cycle detection
- Context-aware skill suggestions via file/directory triggers
- Automatic session activation via Claude Code `SessionStart` hook
- Usage analytics with per-skill tracking
- Remote git sources — browse, sync, and install shared skills
- Skill publishing to portable directories
- Starter packs for curated skill bundles
- MCP server with 9 tools and 2 resources for AI-assisted skill management
- Auto-adopt — detect and import unmanaged skills from tool directories
- Project-scoped deployments (`.claude/skills/`, `.agents/skills/`)
- Shell completions for bash, zsh, and fish
- `sm install` with GitHub shorthand, URL, and external command parsing
- Update detection via SHA-256 content hash comparison
