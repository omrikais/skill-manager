#!/usr/bin/env node

/**
 * Release script for skill-manager.
 *
 * Usage:
 *   node scripts/release.mjs <major|minor|patch|x.y.z>
 *
 * Flags:
 *   --no-verify   Skip lint/build/test preflight checks
 *   --dry-run     Show what would happen without making changes
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const PKG_PATH = resolve(ROOT, 'package.json');
const CHANGELOG_PATH = resolve(ROOT, 'CHANGELOG.md');

// --- Semver helpers (exported for testing via dynamic import) ---

/**
 * Parse a semver string into [major, minor, patch].
 * Returns null if invalid.
 */
export function parseSemver(version) {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/**
 * Bump a semver version by type. Returns the new version string.
 * Throws on invalid input.
 */
export function bumpVersion(current, type) {
  const parts = parseSemver(current);
  if (!parts) throw new Error(`Invalid current version: ${current}`);

  switch (type) {
    case 'major':
      return `${parts[0] + 1}.0.0`;
    case 'minor':
      return `${parts[0]}.${parts[1] + 1}.0`;
    case 'patch':
      return `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
    default:
      throw new Error(`Invalid bump type: ${type}. Use major, minor, or patch.`);
  }
}

/**
 * Resolve the target version from user input.
 * Accepts bump types (major/minor/patch) or explicit version strings.
 */
export function resolveVersion(current, input) {
  if (['major', 'minor', 'patch'].includes(input)) {
    return bumpVersion(current, input);
  }
  // Explicit version — validate strict semver (no leading zeros on numeric parts)
  // Prerelease identifiers: numeric-only must not have leading zeros; alphanumeric
  // (contains at least one non-digit) may start with any valid character
  const preId = '(0|[1-9]\\d*|[a-zA-Z0-9-]*[a-zA-Z-][a-zA-Z0-9-]*)';
  const semverRe = new RegExp(
    `^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)` +
    `(-${preId}(\\.${preId})*)?` +
    `(\\+[a-zA-Z0-9-]+(\\.[a-zA-Z0-9-]+)*)?$`
  );
  if (semverRe.test(input)) {
    return input;
  }
  throw new Error(
    `Invalid version argument: "${input}". Use major, minor, patch, or an explicit version (e.g., 2.0.0).`,
  );
}

// --- Changelog helpers ---

function updateChangelog(version) {
  const today = new Date().toISOString().slice(0, 10);

  if (!existsSync(CHANGELOG_PATH)) {
    throw new Error('CHANGELOG.md not found. Create it first.');
  }

  let content = readFileSync(CHANGELOG_PATH, 'utf-8');

  // Replace [Unreleased] section header and insert new version section
  const unreleasedPattern = /^## \[Unreleased\]\s*$/m;
  if (!unreleasedPattern.test(content)) {
    throw new Error('CHANGELOG.md is missing an ## [Unreleased] section.');
  }

  content = content.replace(
    unreleasedPattern,
    `## [Unreleased]\n\n## [${version}] - ${today}`,
  );

  return content;
}

// --- Main ---

function run(cmd, opts = {}) {
  console.log(`  $ ${cmd}`);
  return execSync(cmd, { cwd: ROOT, stdio: 'inherit', ...opts });
}

function main() {
  const args = process.argv.slice(2);
  const flags = new Set(args.filter((a) => a.startsWith('--')));
  const positional = args.filter((a) => !a.startsWith('--'));

  const dryRun = flags.has('--dry-run');
  const noVerify = flags.has('--no-verify');

  if (positional.length !== 1) {
    console.error('Usage: node scripts/release.mjs <major|minor|patch|x.y.z> [--no-verify] [--dry-run]');
    process.exit(1);
  }

  const pkg = JSON.parse(readFileSync(PKG_PATH, 'utf-8'));
  const currentVersion = pkg.version;
  const newVersion = resolveVersion(currentVersion, positional[0]);

  console.log(`\nRelease: ${currentVersion} → ${newVersion}\n`);

  if (dryRun) {
    console.log('[dry-run] Would perform the following steps:');
    if (!noVerify) {
      console.log('  1. Run preflight checks (lint, build, test)');
    }
    console.log(`  ${noVerify ? '1' : '2'}. Update package.json version to ${newVersion}`);
    console.log(`  ${noVerify ? '2' : '3'}. Update CHANGELOG.md with [${newVersion}] section`);
    console.log(`  ${noVerify ? '3' : '4'}. Create git commit: chore: release v${newVersion}`);
    console.log(`  ${noVerify ? '4' : '5'}. Create git tag: v${newVersion}`);
    console.log('\nNo changes were made.');
    return;
  }

  // Step 0: Verify tag doesn't already exist
  try {
    execSync(`git rev-parse refs/tags/v${newVersion}`, { cwd: ROOT, stdio: 'ignore' });
    console.error(`Error: Tag v${newVersion} already exists.`);
    process.exit(1);
  } catch {
    // Tag doesn't exist — good
  }

  // Step 1: Preflight checks
  if (!noVerify) {
    console.log('Running preflight checks...\n');
    run('npm run lint');
    run('npm run build');
    run('npm test');
    console.log('\nPreflight checks passed.\n');
  }

  // Step 2: Update package.json and sync lockfile
  pkg.version = newVersion;
  writeFileSync(PKG_PATH, JSON.stringify(pkg, null, 2) + '\n');
  console.log(`Updated package.json to ${newVersion}`);
  run('npm install --package-lock-only --ignore-scripts');

  // Step 3: Update CHANGELOG.md
  const updatedChangelog = updateChangelog(newVersion);
  writeFileSync(CHANGELOG_PATH, updatedChangelog);
  console.log(`Updated CHANGELOG.md with [${newVersion}] section`);

  // Step 4: Git commit (pathspec-only — never includes unrelated staged files)
  run(`git commit -m "chore: release v${newVersion}" -- package.json package-lock.json CHANGELOG.md`);
  console.log(`Created commit: chore: release v${newVersion}`);

  // Step 5: Git tag
  run(`git tag -a v${newVersion} -m "v${newVersion}"`);
  console.log(`Created tag: v${newVersion}`);

  console.log(`\nRelease v${newVersion} prepared locally.\n`);
  console.log('To publish, run:');
  console.log(`  git push && git push origin v${newVersion}`);
}

// Only run when executed directly (not when imported for testing)
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main();
}
