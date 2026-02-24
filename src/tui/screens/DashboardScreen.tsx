import React, { useState, useMemo, useEffect, useContext } from 'react';
import { Box, Text, useInput } from 'ink';
import { InputActiveContext, ScreenSizeContext } from '../App.js';
import { Spinner } from '@inkjs/ui';
import type { Skill } from '../../core/skill.js';
import type { LinkRecord } from '../../core/state.js';
import { SkillList } from '../components/SkillList.js';
import { HelpBar } from '../components/HelpBar.js';
import { Divider } from '../components/Divider.js';
import { resolveProjectRoot } from '../../fs/paths.js';
import { colors } from '../theme.js';
import type { ScreenName } from '../theme.js';
import { clampIndex } from '../utils/clampIndex.js';
import { truncate } from '../utils/truncate.js';
import { isTerminalTooSmall, rowsAvailable } from '../utils/layout.js';
import { TerminalSizeWarning } from '../components/TerminalSizeWarning.js';

interface DashboardScreenProps {
  skills: Skill[];
  links: LinkRecord[];
  linksError?: string;
  loading: boolean;
  selectedIndex: number;
  onSelectIndex: (idx: number) => void;
  onNavigate: (screen: ScreenName) => void;
  onSelectSkill: (slug: string) => void;
  onTextInputChange: (searching: boolean) => void;
}

export function DashboardScreen({
  skills,
  links,
  linksError,
  loading,
  selectedIndex,
  onSelectIndex,
  onNavigate,
  onSelectSkill,
  onTextInputChange,
}: DashboardScreenProps) {
  const projectRoot = resolveProjectRoot(process.cwd());
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState('');
  const [message, setMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);

  const filteredSkills = useMemo(() => {
    if (!searchQuery) return skills;
    const q = searchQuery.toLowerCase();
    return skills.filter(
      (s) =>
        s.slug.includes(q) ||
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }, [skills, searchQuery]);

  useEffect(() => {
    onSelectIndex(0);
  }, [searchQuery]); // eslint-disable-line react-hooks/exhaustive-deps

  const inputActive = useContext(InputActiveContext);
  const { height, width } = useContext(ScreenSizeContext);
  // StatusBar(1) + ScopeRows(2)+marginTop(1) + search(~2) + Divider marginTop(1)+content(1) + SkillList marginTop(1)+headers(2) + position(1) + message(~2) + HelpBar marginTop(1)+content(1) = ~16, +2 for HelpBar wrapping on narrow terminals
  const listMaxHeight = rowsAvailable(height, 18, 4);
  // 25 = prefixWidth(2) + dots-section(19) + margin(4)
  const nameWidth = Math.max(20, Math.min(50, width - 25));

  useInput(
    (input, key) => {
      // Block all keys except Esc when terminal is too small for the UI
      if (isTerminalTooSmall(width, height, 90, 24)) {
        if (!key.escape) return;
      }

      if (busy) return;

      // Search uses manual char-by-char accumulation (no cursor editing) rather than
      // <TextInput> from @inkjs/ui. This keeps the interaction model simple — search mode
      // is a filter overlay within useInput, not a separate focused component.
      if (searching) {
        if (key.escape) {
          setSearching(false);
          setSearchQuery('');
          onTextInputChange(false);
          onSelectIndex(0);
        } else if (key.return) {
          setSearching(false);
          onTextInputChange(false);
        } else if (key.backspace || key.delete) {
          setSearchQuery((q) => q.slice(0, -1));
        } else if (input && !key.ctrl) {
          setSearchQuery((q) => q + input);
        }
        return;
      }

      if (input === 'j' || key.downArrow) {
        onSelectIndex(clampIndex(filteredSkills.length, selectedIndex + 1));
      }
      if (input === 'k' || key.upArrow) {
        onSelectIndex(Math.max(selectedIndex - 1, 0));
      }
      if (key.return && filteredSkills[selectedIndex]) {
        onSelectSkill(filteredSkills[selectedIndex].slug);
        onNavigate('detail');
      }
      if (input === '/') {
        setSearching(true);
        onTextInputChange(true);
      }
      if (key.escape && searchQuery) {
        setSearchQuery('');
        onSelectIndex(0);
      }
      if (input === 'b') onNavigate('browser');
      if (input === 'i') onNavigate('import');
      if (input === 's') onNavigate('sync');
      if (input === 'p') onNavigate('profiles');
      if (input === 'r') onNavigate('sources');
      if (input === 'g') onNavigate('generate');
      if (input === 'm') {
        setBusy(true);
        setBusyLabel('Configuring MCP server...');
        setMessage('');
        void (async () => {
          try {
            const { mcpSetupCommand } = await import('../../mcp/setup.js');
            const result = await mcpSetupCommand({ tool: 'all', scope: 'user' });
            if (result.succeeded.length > 0 && result.failed.length === 0) {
              setMessage(`MCP server configured for ${result.succeeded.join(' & ')}`);
            } else if (result.succeeded.length > 0) {
              setMessage(
                `MCP server configured for ${result.succeeded.join(' & ')} (${result.failed.join(', ')} failed \u2014 see manual instructions above)`,
              );
            } else {
              setMessage('MCP setup failed \u2014 see manual instructions above or run `sm mcp setup`');
            }
          } catch {
            setMessage('MCP setup failed \u2014 run `sm mcp setup` for details');
          }
          setBusy(false);
        })();
      }
      if (input === 'M') {
        setBusy(true);
        setBusyLabel('Removing MCP server...');
        setMessage('');
        void (async () => {
          try {
            const { mcpUninstallCommand } = await import('../../mcp/setup.js');
            const result = await mcpUninstallCommand({ tool: 'all', scope: 'user' });
            if (result.succeeded.length > 0 && result.failed.length === 0) {
              setMessage(`MCP server removed from ${result.succeeded.join(' & ')}`);
            } else if (result.succeeded.length > 0) {
              setMessage(
                `MCP server removed from ${result.succeeded.join(' & ')} (${result.failed.join(', ')} failed \u2014 see instructions above)`,
              );
            } else {
              setMessage('MCP uninstall failed \u2014 see instructions above or run `sm mcp uninstall`');
            }
          } catch {
            setMessage('MCP uninstall failed \u2014 run `sm mcp uninstall` for details');
          }
          setBusy(false);
        })();
      }
    },
    { isActive: inputActive },
  );

  if (isTerminalTooSmall(width, height, 90, 24)) {
    return <TerminalSizeWarning screenName="Dashboard" width={width} height={height} minWidth={90} minHeight={24} />;
  }

  if (loading) {
    return (
      <Box>
        <Spinner label="Loading skills..." />
      </Box>
    );
  }

  const userLinks = links.filter((l) => (l.scope ?? 'user') === 'user');
  const projectLinks = links.filter((l) => l.scope === 'project' && l.projectRoot === projectRoot);

  const userCount = new Set(userLinks.map((l) => l.slug)).size;
  const projectCount = new Set(projectLinks.map((l) => l.slug)).size;
  const userCcCount = new Set(userLinks.filter((l) => l.tool === 'cc').map((l) => l.slug)).size;
  const userCodexCount = new Set(userLinks.filter((l) => l.tool === 'codex').map((l) => l.slug)).size;
  const projectCcCount = new Set(projectLinks.filter((l) => l.tool === 'cc').map((l) => l.slug)).size;
  const projectCodexCount = new Set(projectLinks.filter((l) => l.tool === 'codex').map((l) => l.slug)).size;
  const total = Math.max(skills.length, 1);

  return (
    <Box flexDirection="column">
      <Box flexDirection="column" marginTop={1}>
        <ScopeBarRow
          label="User"
          value={userCount}
          total={total}
          color={colors.primary}
          ccCount={userCcCount}
          codexCount={userCodexCount}
        />
        <ScopeBarRow
          label="Project"
          value={projectCount}
          total={total}
          color={colors.primary}
          ccCount={projectCcCount}
          codexCount={projectCodexCount}
        />
      </Box>

      {(searching || searchQuery) && (
        <Box marginTop={1}>
          {searching ? (
            <Text color={colors.primary}>
              / {searchQuery}
              <Text color={colors.muted}>_</Text>
            </Text>
          ) : (
            <Text color={colors.muted}>/ {searchQuery}</Text>
          )}
        </Box>
      )}

      <Divider
        label="Skills"
        rightLabel={searchQuery ? `${filteredSkills.length}/${skills.length} matching` : `${skills.length} skills`}
      />

      {filteredSkills.length > 0 ? (
        <Box marginTop={1} flexDirection="column">
          <SkillList
            skills={filteredSkills}
            links={links}
            selectedIndex={selectedIndex}
            projectRoot={projectRoot}
            showDescription={false}
            maxHeight={listMaxHeight}
            nameWidth={nameWidth}
          />
        </Box>
      ) : searchQuery ? (
        <Box marginTop={1}>
          <Text color={colors.muted}>No matching skills</Text>
        </Box>
      ) : (
        <Box marginTop={1}>
          <Text color={colors.warning}>
            No skills found. Press <Text bold>i</Text> to import existing skills.
          </Text>
        </Box>
      )}

      {linksError && (
        <Box marginTop={1}>
          <Text color={colors.error}>Failed to load deployments: {linksError}</Text>
        </Box>
      )}

      {busy && (
        <Box marginTop={1}>
          <Spinner label={busyLabel} />
        </Box>
      )}

      {message && !busy && (
        <Box marginTop={1}>
          <Text color={message.includes('failed') ? colors.error : colors.success}>{truncate(message, width - 2)}</Text>
        </Box>
      )}

      <HelpBar
        bindings={[
          { key: 'j/k', action: 'navigate' },
          { key: 'Enter', action: 'detail' },
          { key: '/', action: 'search' },
          { key: 'b', action: 'browse' },
          { key: 'i', action: 'import' },
          { key: 's', action: 'sync' },
          { key: 'r', action: 'sources' },
          { key: 'p', action: 'profiles' },
          { key: 'g', action: 'generate' },
          { key: 'm/M', action: 'MCP setup/remove' },
          { key: '?', action: 'more' },
          { key: 'q', action: 'quit' },
        ]}
      />
    </Box>
  );
}

function ScopeBarRow({
  label,
  value,
  total,
  color,
  ccCount,
  codexCount,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
  ccCount: number;
  codexCount: number;
}) {
  return (
    <Box>
      <Text color={colors.text} bold>
        {label.padEnd(9)}
      </Text>
      <Text color={color}>{renderBar(value, total, 16)}</Text>
      <Text color={colors.muted}>{`  ${String(value).padStart(2)}/${total}`.padEnd(10)}</Text>
      <Text color={colors.cc}>CC {ccCount}</Text>
      <Text color={colors.dim}> {'\u00B7'} </Text>
      <Text color={colors.codex}>Codex {codexCount}</Text>
    </Box>
  );
}

function renderBar(value: number, total: number, width: number): string {
  const safeTotal = Math.max(total, 1);
  const filled = Math.max(0, Math.min(width, Math.round((value / safeTotal) * width)));
  return `${'\u2588'.repeat(filled)}${'\u2591'.repeat(width - filled)}`;
}
