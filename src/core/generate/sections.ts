import type {
  ProjectMeta,
  GenerateTarget,
  GenerateMode,
  SectionBuildOptions,
  GeneratedSection,
  SectionName,
} from './types.js';

type SectionBuilder = (
  meta: ProjectMeta,
  target: GenerateTarget,
  mode: GenerateMode,
  opts: SectionBuildOptions,
) => GeneratedSection | null;

// ─── Identity ────────────────────────────────────────────────

const buildIdentity: SectionBuilder = (meta, _target, mode) => {
  const lines: string[] = [];

  if (mode === 'summary') {
    lines.push(`**${meta.projectName}**${meta.oneLiner ? ` — ${meta.oneLiner}` : ''}`);
    if (meta.stack.length > 0) lines.push(`Stack: ${meta.stack.join(', ')}`);
    if (meta.packageManager) lines.push(`Package manager: ${meta.packageManager}`);
  } else {
    lines.push(`# ${meta.projectName}`);
    lines.push('');
    lines.push(meta.oneLiner ?? '[TODO: describe what this project does]');
    lines.push('');
    if (meta.stack.length > 0) {
      lines.push(`**Stack:** ${meta.stack.join(', ')}`);
    }
    if (meta.packageManager) {
      lines.push(`**Package manager:** ${meta.packageManager}`);
    }
    if (meta.isEsm) {
      lines.push(`**Module system:** ESM`);
    }
  }

  return { name: 'identity', title: 'Identity', content: lines.join('\n') };
};

// ─── Commands ────────────────────────────────────────────────

const buildCommands: SectionBuilder = (meta, _target, mode) => {
  if (meta.commands.length === 0) return null;

  const lines: string[] = [];

  if (mode === 'summary') {
    lines.push('## Commands');
    lines.push('');
    for (const cmd of meta.commands) {
      lines.push(`- \`${cmd.command}\` — ${cmd.description}`);
    }
  } else if (mode === 'reference') {
    lines.push('## Commands');
    lines.push('');
    lines.push('See `package.json` scripts for all available commands.');
    lines.push('');
    lines.push('Key commands:');
    for (const cmd of meta.commands.slice(0, 5)) {
      lines.push(`- \`${cmd.command}\``);
    }
  } else {
    // inline
    lines.push('## Commands');
    lines.push('');
    lines.push('| Command | Description |');
    lines.push('|---------|-------------|');
    for (const cmd of meta.commands) {
      lines.push(`| \`${cmd.command}\` | ${cmd.description} |`);
    }
  }

  return { name: 'commands', title: 'Commands', content: lines.join('\n') };
};

// ─── Architecture ────────────────────────────────────────────

const buildArchitecture: SectionBuilder = (meta, _target, mode) => {
  if (meta.architecture.length === 0) return null;

  const lines: string[] = [];

  if (mode === 'summary') {
    lines.push('## Architecture');
    lines.push('');
    for (const entry of meta.architecture) {
      lines.push(`- \`${entry.path}\` — ${entry.purpose}`);
    }
  } else {
    lines.push('## Architecture');
    lines.push('');
    lines.push('```');
    for (const entry of meta.architecture) {
      lines.push(`${entry.path.padEnd(24)} → ${entry.purpose}`);
    }
    lines.push('```');
  }

  return { name: 'architecture', title: 'Architecture', content: lines.join('\n') };
};

// ─── Conventions ─────────────────────────────────────────────

const buildConventions: SectionBuilder = (meta) => {
  if (meta.conventions.length === 0) return null;

  const lines: string[] = [];
  lines.push('## Conventions');
  lines.push('');
  for (const conv of meta.conventions) {
    lines.push(`- ${conv}`);
  }

  return { name: 'conventions', title: 'Conventions', content: lines.join('\n') };
};

// ─── Safety ──────────────────────────────────────────────────

const buildSafety: SectionBuilder = (meta) => {
  if (meta.safetyRules.length === 0) return null;

  const lines: string[] = [];
  lines.push('## Safety Rules');
  lines.push('');
  for (const rule of meta.safetyRules) {
    lines.push(`- ${rule}`);
  }

  return { name: 'safety', title: 'Safety Rules', content: lines.join('\n') };
};

// ─── Testing ─────────────────────────────────────────────────

const buildTesting: SectionBuilder = (meta, _target, mode) => {
  const { testInfo } = meta;
  if (!testInfo.framework && testInfo.dirs.length === 0) return null;

  const lines: string[] = [];
  lines.push('## Testing');
  lines.push('');

  if (testInfo.framework) {
    lines.push(`**Framework:** ${testInfo.framework}`);
  }
  if (testInfo.dirs.length > 0) {
    lines.push(`**Test directories:** ${testInfo.dirs.map((d) => `\`${d}/\``).join(', ')}`);
  }
  if (testInfo.configFile) {
    lines.push(`**Config:** \`${testInfo.configFile}\``);
  }

  if (mode === 'inline') {
    lines.push('');
    lines.push('Before submitting changes:');
    lines.push('- Run the full test suite');
    lines.push('- Add tests for new functionality');
    lines.push('- Ensure no regressions in existing tests');
  }

  return { name: 'testing', title: 'Testing', content: lines.join('\n') };
};

// ─── Gotchas ─────────────────────────────────────────────────

const buildGotchas: SectionBuilder = (meta) => {
  if (meta.gotchas.length === 0) return null;

  const lines: string[] = [];
  lines.push('## Gotchas');
  lines.push('');
  for (const g of meta.gotchas) {
    lines.push(`- ${g}`);
  }

  return { name: 'gotchas', title: 'Gotchas', content: lines.join('\n') };
};

// ─── Skills ──────────────────────────────────────────────────

const buildSkills: SectionBuilder = (_meta, _target, _mode, opts) => {
  if (!opts.includeSkills || !opts.skills || opts.skills.length === 0) return null;

  const lines: string[] = [];
  lines.push('## Installed Skills');
  lines.push('');
  for (const skill of opts.skills) {
    lines.push(`- **${skill.name}** (\`${skill.slug}\`): ${skill.description}`);
    if (skill.triggers) {
      const triggers: string[] = [];
      if (skill.triggers.files?.length) triggers.push(`files: ${skill.triggers.files.join(', ')}`);
      if (skill.triggers.dirs?.length) triggers.push(`dirs: ${skill.triggers.dirs.join(', ')}`);
      if (triggers.length > 0) {
        lines.push(`  - Triggers: ${triggers.join('; ')}`);
      }
    }
  }

  return { name: 'skills', title: 'Installed Skills', content: lines.join('\n') };
};

// ─── MCP ─────────────────────────────────────────────────────

const buildMcp: SectionBuilder = (_meta, _target, _mode, opts) => {
  if (!opts.withMcp) return null;

  const lines: string[] = [];
  lines.push('## MCP Integration');
  lines.push('');
  lines.push('The Skill Manager MCP server is available for AI tool integration.');
  lines.push('Run `sm mcp setup` to configure it for your tools.');

  return { name: 'mcp', title: 'MCP Integration', content: lines.join('\n') };
};

// ─── Tool-Specific ───────────────────────────────────────────

const buildToolSpecific: SectionBuilder = (_meta, target, mode) => {
  const lines: string[] = [];

  if (target === 'claude-md') {
    lines.push('## Claude Code Notes');
    lines.push('');
    if (mode === 'summary') {
      lines.push('- Use `/` commands for common operations');
      lines.push('- Session hooks auto-activate relevant skills');
    } else {
      lines.push('### Hooks');
      lines.push('');
      lines.push('Session hooks can auto-activate relevant skills based on project context.');
      lines.push('Run `sm hooks setup` to configure.');
      lines.push('');
      lines.push('### Slash Commands');
      lines.push('');
      lines.push('Skills deployed as legacy commands are available as `/command-name` in Claude Code.');
    }
  } else {
    lines.push('## Codex Notes');
    lines.push('');
    if (mode === 'summary') {
      lines.push('- Skills are loaded from `~/.agents/skills/`');
      lines.push('- Use `--approval-mode` for sandbox control');
    } else {
      lines.push('### Workflow');
      lines.push('');
      lines.push('Codex reads skills from `~/.agents/skills/` on startup.');
      lines.push('');
      lines.push('### Sandbox');
      lines.push('');
      lines.push('Use `--approval-mode` to control execution permissions:');
      lines.push('- `suggest` — read-only, all commands need approval');
      lines.push('- `auto-edit` — can edit files, commands need approval');
      lines.push('- `full-auto` — full autonomy');
    }
  }

  return { name: 'tool-specific', title: target === 'claude-md' ? 'Claude Code Notes' : 'Codex Notes', content: lines.join('\n') };
};

// ─── Registry ────────────────────────────────────────────────

const BUILDERS: Record<SectionName, SectionBuilder> = {
  identity: buildIdentity,
  commands: buildCommands,
  architecture: buildArchitecture,
  conventions: buildConventions,
  safety: buildSafety,
  testing: buildTesting,
  gotchas: buildGotchas,
  skills: buildSkills,
  mcp: buildMcp,
  'tool-specific': buildToolSpecific,
};

export function buildSection(
  name: SectionName,
  meta: ProjectMeta,
  target: GenerateTarget,
  mode: GenerateMode,
  opts: SectionBuildOptions,
): GeneratedSection | null {
  const builder = BUILDERS[name];
  return builder(meta, target, mode, opts);
}

export function buildAllSections(
  meta: ProjectMeta,
  target: GenerateTarget,
  mode: GenerateMode,
  opts: SectionBuildOptions,
  filter?: SectionName,
): GeneratedSection[] {
  const sections: GeneratedSection[] = [];
  for (const [name, builder] of Object.entries(BUILDERS)) {
    if (filter && name !== filter) continue;
    const section = builder(meta, target, mode, opts);
    if (section) sections.push(section);
  }
  return sections;
}
