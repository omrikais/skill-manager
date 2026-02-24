import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import { z } from 'zod';
import { handleSessionStart, type HookInput } from '../core/hooks.js';
import { UsageError } from '../utils/errors.js';
import { CC_HOME } from '../fs/paths.js';

const HookInputSchema = z.object({
  session_id: z.string(),
  cwd: z.string(),
  source: z.string(),
});

export async function hooksRunCommand(event: string): Promise<void> {
  if (event !== 'session-start') {
    throw new UsageError(`Unknown hook event: "${event}". Supported events: session-start`);
  }

  if (process.stdin.isTTY) {
    throw new UsageError('sm hooks run expects JSON input on stdin. This command is called by Claude Code hooks, not invoked directly.');
  }

  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  const raw = Buffer.concat(chunks).toString('utf-8').trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new UsageError(`Invalid JSON on stdin: ${raw.slice(0, 100)}`);
  }

  const input = HookInputSchema.parse(parsed) as HookInput;
  const result = await handleSessionStart(input);

  if (result.contextOutput) {
    process.stdout.write(result.contextOutput + '\n');
  }
}

interface HooksSetupOptions {
  project?: boolean;
}

export async function hooksSetupCommand(opts: HooksSetupOptions): Promise<void> {
  const hookEntry = {
    matcher: '',
    hooks: [
      {
        type: 'command',
        command: 'sm hooks run session-start',
        timeout: 30,
      },
    ],
  };

  const settingsPath = opts.project
    ? path.join(process.cwd(), '.claude', 'settings.local.json')
    : path.join(CC_HOME, 'settings.json');

  // Ensure directory exists
  await fs.ensureDir(path.dirname(settingsPath));

  let settings: Record<string, unknown> = {};
  if (await fs.pathExists(settingsPath)) {
    try {
      settings = await fs.readJson(settingsPath);
    } catch {
      // Start fresh if file is corrupted
    }
  }

  // Check if already configured
  const hooks = settings.hooks as Record<string, unknown[]> | undefined;
  if (hooks?.SessionStart) {
    const existing = hooks.SessionStart as Array<{ hooks?: Array<{ command?: string }> }>;
    const alreadyConfigured = existing.some((entry) =>
      entry.hooks?.some((h) => h.command?.includes('sm hooks run')),
    );
    if (alreadyConfigured) {
      console.log(chalk.dim(`Hook already configured in ${settingsPath}`));
      return;
    }
  }

  // Merge hook entry
  if (!settings.hooks) {
    settings.hooks = {};
  }
  const hooksObj = settings.hooks as Record<string, unknown[]>;
  if (!hooksObj.SessionStart) {
    hooksObj.SessionStart = [];
  }
  (hooksObj.SessionStart as unknown[]).push(hookEntry);

  await fs.writeJson(settingsPath, settings, { spaces: 2 });
  console.log(chalk.green(`✓ Hook configured in ${settingsPath}`));
}
