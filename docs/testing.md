# Test Suite

The skill-manager test suite uses [Vitest](https://vitest.dev/) with 197 tests across 24 files organized in three tiers.

## Running Tests

```bash
npm test                          # run all tests once
npm run test:watch                # watch mode (re-runs on file changes)
npx vitest run tests/unit/        # unit tests only
npx vitest run tests/fs/          # FS layer tests only
npx vitest run tests/deploy/      # deploy engine tests only
npx vitest run tests/unit/hash.test.ts  # single file
```

## Directory Structure

```
tests/
├── helpers/
│   └── tmpdir.ts                 # Isolated tmpdir test harness
├── unit/                         # Pure function tests (no I/O)
│   ├── frontmatter.test.ts       # Frontmatter parsing and serialization
│   ├── slugify.test.ts           # Slug generation
│   ├── hash.test.ts              # Content hashing
│   ├── dedup.test.ts             # File deduplication logic
│   ├── manifest.test.ts          # Project manifest resolution
│   ├── paths.test.ts             # Deploy path resolution
│   ├── completion.test.ts        # Shell completion script generation
│   ├── analytics.test.ts         # Stale/unused skill detection, usage stats
│   ├── versioning.test.ts        # Version history logic
│   ├── deps.test.ts              # Dependency graph resolution
│   └── triggers.test.ts          # Trigger scoring logic
├── fs/                           # Filesystem tests (use tmpdirs)
│   ├── links.test.ts             # Symlink CRUD and health validation
│   ├── state.test.ts             # State file persistence
│   ├── config.test.ts            # TOML config loading
│   ├── scanner.test.ts           # Source directory scanning
│   ├── backup.test.ts            # Backup create/list/restore
│   ├── versioning.test.ts        # Version history persistence
│   ├── deps.test.ts              # Dependency graph with filesystem
│   ├── triggers.test.ts          # Trigger matching with real skills
│   ├── hooks.test.ts             # Session hook activation, dep resolution, usage tracking
│   └── hooks-setup.test.ts       # Hook setup command (settings.json management)
└── deploy/
    ├── engine.test.ts            # Deploy/undeploy with state tracking
    ├── add-missing-deps.test.ts  # Dependency deploy edge cases
    └── project-scope.test.ts     # Project-scoped deployments
```

## Test Tiers

### Tier 1: Unit Tests (`tests/unit/`)

Pure function tests that use static imports and require no mocking, no filesystem access, and no tmpdir setup. These are fast and deterministic.

| File | Module Under Test | Tests | Key Cases |
|------|-------------------|-------|-----------|
| `frontmatter.test.ts` | `src/core/frontmatter.ts` | 7 | Valid frontmatter, no frontmatter, passthrough fields, round-trip, invalid tags → ZodError |
| `slugify.test.ts` | `src/utils/slug.ts` | 11 | Normal text, spaces, empty → `""`, path traversal chars, collapsed hyphens, ALL CAPS, special chars |
| `hash.test.ts` | `src/core/hash.ts` | 6 | Deterministic, idempotent, whitespace trimming, SHA-256 format, empty string, different content |
| `dedup.test.ts` | `src/core/dedup.ts` | 5 | Same hash → one group, same slug different hash → suffix, canonical source priority, empty input |
| `manifest.test.ts` | `src/core/manifest.ts` | 6 | `createEmptyManifest`, `resolveActiveSkills` with/without profile, no duplicates, nonexistent profile |
| `paths.test.ts` | `src/fs/paths.ts` | 12 | `deployTargetDir` all tool×format combos, `deployLinkPath` all combos, null for invalid combos |
| `completion.test.ts` | `src/commands/completion.ts` | 7 | Bash `complete -F`, zsh `#compdef`, fish `complete -c`, known subcommands, unsupported shell error |
| `analytics.test.ts` | `src/core/analytics.ts` | 15 | `findStaleSkills` edge cases, `findUnusedSkills` with/without lastUsed, `getUsageStats` sorting and defaults |
| `versioning.test.ts` | `src/core/versioning.ts` | 3 | Version record creation, content-hash dedup |
| `deps.test.ts` | `src/core/deps.ts` | 13 | Topological sort, cycle detection, missing deps, diamond deps, `getDependents` |
| `triggers.test.ts` | `src/core/triggers.ts` | 5 | `scoreSuggestion` thresholds for high/medium/low/zero |

### Tier 2: FS Layer Tests (`tests/fs/`)

Filesystem tests that create isolated temporary directories. Each test gets a fresh `SM_HOME` via the tmpdir helper so tests never touch the real `~/.skill-manager`.

| File | Module Under Test | Tests | Key Cases |
|------|-------------------|-------|-----------|
| `links.test.ts` | `src/fs/links.ts` | 17 | Create, idempotent, replace wrong target, parent dir creation, remove symlink/file/missing, isSymlink, validate 5 health states (healthy/missing/conflict/stale/broken), repair |
| `state.test.ts` | `src/core/state.ts` | 13 | Default on fresh dir, save/load round-trip, addLinkRecord dedup by slug+tool, removeLinkRecord no-op, updateLastSync, scoped link records |
| `config.test.ts` | `src/core/config.ts` | 4 | Default on fresh dir, save/load round-trip, corrupt TOML → throw, invalid schema → throw |
| `scanner.test.ts` | `src/fs/scanner.ts` | 7 | Empty dirs, .md files, skill dirs, dotfile skip, missing source dirs, symlink following, broken symlinks |
| `backup.test.ts` | `src/fs/backup.ts` | 6 | Create backup with manifest, missing source dir, listBackups, restoreBackup, nonexistent backup → throw |
| `versioning.test.ts` | `src/core/versioning.ts` | 11 | Record, load, rollback, duplicate skip, multi-version history |
| `deps.test.ts` | `src/core/deps.ts` | 6 | `getDirectDeps`, `buildDepGraph` from real skills |
| `triggers.test.ts` | `src/core/triggers.ts` | 8 | `scanProjectSignals`, `matchSkillTriggers` with file/dir triggers, deploy status detection (partial, full, single-tool) |
| `hooks.test.ts` | `src/core/hooks.ts` | 10 | Session activation, auto-deploy with deps, per-tool dep failure skip, circular dep skip, no-deploy-target skip, usage only on success, context output |
| `hooks-setup.test.ts` | `src/commands/hooks.ts` | 4 | Create settings.json, idempotent, preserve existing settings, `--project` flag |

### Tier 3: Deploy Engine Tests (`tests/deploy/`)

Integration tests that exercise the full deploy pipeline (read meta → create symlink → record state).

| File | Module Under Test | Tests | Key Cases |
|------|-------------------|-------|-----------|
| `engine.test.ts` | `src/deploy/engine.ts` | 7 | Deploy skill/legacy-command/legacy-prompt formats, skip format:none, state recording, undeploy, idempotent (no duplicate state records) |
| `add-missing-deps.test.ts` | `src/commands/add.ts` | 3 | Missing dep → error, `--no-deps` bypass, normal dep deploy |
| `project-scope.test.ts` | `src/deploy/engine.ts` | 11 | Project-scoped deploy/undeploy, link isolation, state scoping |

## Test Isolation: The Tmpdir Helper

FS and deploy tests use `tests/helpers/tmpdir.ts` to create isolated environments:

```typescript
import { createTmpSmHome, type TmpSmHome } from '../helpers/tmpdir.js';

let tmp: TmpSmHome;

beforeEach(async () => {
  tmp = await createTmpSmHome();
  vi.resetModules();  // force path constants to re-evaluate
});

afterEach(async () => {
  await tmp.cleanup();
});

it('does something', async () => {
  // Dynamic import AFTER env vars are set
  const { loadState, resetStateCache } = await import('../../src/core/state.js');
  resetStateCache();  // clear any module-level cache

  const state = await loadState();
  // state.json is in tmp.smHome, not ~/.skill-manager
});
```

### How It Works

1. `createTmpSmHome()` creates a random directory under `os.tmpdir()` and sets two env vars:
   - `SM_TEST_HOME` — overrides `os.homedir()` for all paths (CC_HOME, CODEX_HOME, etc.)
   - `SM_HOME` — overrides just the `~/.skill-manager` root
2. `vi.resetModules()` clears the module cache so that `src/fs/paths.ts` re-reads the env vars when dynamically imported
3. Tests use dynamic `import()` after env vars are set to get path constants pointing to the temp directory
4. Modules with caches (`state.ts`, `config.ts`) expose `resetXxxCache()` functions that must be called after `vi.resetModules()`
5. `cleanup()` deletes the temp directory and unsets the env vars

### Important Patterns

- **Always call `vi.resetModules()` in `beforeEach`** — without this, path constants from a previous test leak into the next
- **Always use dynamic imports** — static imports capture path constants at module load time, before env vars are set
- **Always call `resetStateCache()` / `resetConfigCache()`** — these modules cache their data in module-level variables
- **Create required directories** — the temp home starts empty; create `.claude/commands/`, `.codex/skills/`, etc. as needed for each test

## Adding New Tests

### Pure function test

1. Create `tests/unit/<name>.test.ts`
2. Use static imports — no tmpdir needed
3. Follow the pattern in existing unit tests

### FS/deploy test

1. Create `tests/fs/<name>.test.ts` or `tests/deploy/<name>.test.ts`
2. Use the tmpdir helper pattern shown above
3. Set up any required directories in the temp home
4. Use dynamic imports after `vi.resetModules()`

### Conventions

- Test files use the `.test.ts` extension
- Describe blocks mirror the module's exported function names
- Each test case has a descriptive name starting with a verb (e.g., "returns default state on fresh directory")
- FS tests clean up after themselves via `tmp.cleanup()` in `afterEach`
