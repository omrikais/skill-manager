import type { ScreenName } from './theme.js';

/**
 * Maps source screen step names to their help category.
 * Used by HelpOverlay to show only the relevant group.
 */
export const sourcesStepCategory: Record<string, string> = {
  list: 'Source List',
  detail: 'Source Detail',
  adding: 'Source List',
  'show-diff': 'Diff View',
  'confirm-update': 'Source Detail',
  'confirm-delete': 'Source List',
};

export interface HelpBinding {
  key: string;
  action: string;
}

export interface HelpGroup {
  category: string;
  bindings: HelpBinding[];
}

export const globalHelp: HelpGroup = {
  category: 'Global',
  bindings: [
    { key: '?', action: 'Toggle this help overlay' },
    { key: 'q', action: 'Quit' },
  ],
};

export const screenHelp: Record<ScreenName, HelpGroup[]> = {
  dashboard: [
    {
      category: 'Navigation',
      bindings: [
        { key: 'j/k', action: 'Navigate list' },
        { key: 'Enter', action: 'Open skill detail' },
        {
          key: '/',
          action: 'Search skills (type to filter, Backspace to delete, Enter to accept, Esc to clear/cancel)',
        },
        { key: 'Esc', action: 'Clear search filter' },
      ],
    },
    {
      category: 'Screens',
      bindings: [
        { key: 'b', action: 'Browse all skills' },
        { key: 'i', action: 'Import wizard' },
        { key: 's', action: 'Sync & health check' },
        { key: 'p', action: 'Project profiles' },
        { key: 'r', action: 'Skill sources' },
        { key: 'g', action: 'Generate CLAUDE.md' },
      ],
    },
    {
      category: 'Actions',
      bindings: [
        { key: 'm', action: 'Install MCP server' },
        { key: 'M', action: 'Remove MCP server' },
      ],
    },
  ],
  browser: [
    {
      category: 'Navigation',
      bindings: [
        { key: 'j/k', action: 'Navigate list' },
        { key: 'Enter', action: 'Open skill detail' },
        {
          key: '/',
          action: 'Search skills (type to filter, Backspace to delete, Enter to accept, Esc to clear/cancel)',
        },
        { key: 'f', action: 'Cycle filter (all, cc, codex, project, undeployed, remote)' },
        { key: 'Esc', action: 'Clear selection / go back to Dashboard' },
      ],
    },
    {
      category: 'Multi-Select',
      bindings: [
        { key: 'Space', action: 'Select / deselect skill' },
        { key: 'Tab', action: 'Switch deploy scope (User / Project)' },
        { key: 'c', action: 'Toggle CC tool targeting' },
        { key: 'x', action: 'Toggle Codex tool targeting' },
        { key: '+', action: 'Deploy selected to target scope/tools' },
        { key: '-', action: 'Undeploy selected from target scope/tools' },
      ],
    },
    {
      category: 'Actions',
      bindings: [{ key: 'D', action: 'Delete skill(s) permanently (with confirmation)' }],
    },
  ],
  detail: [
    {
      category: 'Scope',
      bindings: [
        { key: 'Tab', action: 'Switch active scope (User / Project)' },
        { key: 'u', action: 'Set active scope to User' },
        { key: 'p', action: 'Set active scope to Project' },
      ],
    },
    {
      category: 'Deploy',
      bindings: [
        { key: 'c', action: 'Toggle CC deployment in active scope' },
        { key: 'x', action: 'Toggle Codex deployment in active scope' },
        { key: '+', action: 'Deploy both tools in active scope' },
        { key: '-', action: 'Remove both tools from active scope' },
      ],
    },
    {
      category: 'Edit',
      bindings: [
        { key: 'e', action: 'Edit in external editor' },
        { key: 'E', action: 'Edit frontmatter fields' },
      ],
    },
    {
      category: 'Actions',
      bindings: [
        { key: 'D', action: 'Delete skill permanently (with confirmation)' },
        { key: 'Esc', action: 'Go back' },
      ],
    },
  ],
  import: [
    {
      category: 'Import Wizard',
      bindings: [
        { key: 'Enter', action: 'Import selected skills' },
        { key: 'Space', action: 'Toggle skill selection' },
        { key: 'a', action: 'Select all skills' },
        { key: 'n', action: 'Deselect all skills' },
        { key: 'j/k', action: 'Navigate skills' },
        { key: 'Esc', action: 'Cancel and go back' },
      ],
    },
  ],
  sync: [
    {
      category: 'Sync & Health',
      bindings: [
        { key: 'm', action: 'Migrate deprecated formats (when available)' },
        { key: 'r', action: 'Repair all broken links' },
        { key: 's', action: 'Re-scan links' },
        { key: 'Esc', action: 'Go back to Dashboard' },
      ],
    },
  ],
  profiles: [
    {
      category: 'Profiles',
      bindings: [
        { key: 'j/k', action: 'Navigate profiles' },
        { key: 'Enter', action: 'Apply selected profile' },
        { key: 'Esc', action: 'Go back to Dashboard' },
      ],
    },
  ],
  sources: [
    {
      category: 'Source List',
      bindings: [
        { key: 'j/k', action: 'Navigate sources' },
        { key: 'Enter', action: 'View source detail' },
        { key: 'a', action: 'Add new source' },
        { key: 's', action: 'Sync selected source' },
        { key: 'D', action: 'Remove selected source' },
        { key: 'Esc', action: 'Go back to Dashboard' },
      ],
    },
    {
      category: 'Source Detail',
      bindings: [
        { key: 'j/k', action: 'Navigate skills' },
        { key: 'i', action: 'Install or update selected skill' },
        { key: 'I', action: 'Install and update all skills' },
        { key: 'd', action: 'View diff for installed skill' },
        { key: 'Esc', action: 'Back to source list' },
      ],
    },
    {
      category: 'Diff View',
      bindings: [
        { key: 'j/k', action: 'Scroll diff' },
        { key: 'y', action: 'Accept update' },
        { key: 'Esc', action: 'Back to detail' },
      ],
    },
  ],
  generate: [
    {
      category: 'Configure',
      bindings: [
        { key: 'j/k', action: 'Navigate options' },
        { key: 'Space/Tab', action: 'Toggle option' },
        { key: 'Enter', action: 'Generate preview' },
        { key: 'Esc', action: 'Go back to Dashboard' },
      ],
    },
    {
      category: 'Preview',
      bindings: [
        { key: 'j/k', action: 'Scroll content' },
        { key: 'd/u', action: 'Page down / page up' },
        { key: 'v', action: 'Toggle raw / rendered view' },
        { key: 't', action: 'Switch file tab' },
        { key: 'Enter', action: 'Write files' },
        { key: 'Esc', action: 'Back to configure' },
      ],
    },
  ],
};
