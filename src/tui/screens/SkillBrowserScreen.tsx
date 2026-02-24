import React, { useState, useMemo, useContext } from 'react';
import { Box, Text, useInput } from 'ink';
import { InputActiveContext, ScreenSizeContext } from '../App.js';
import { deleteSkill, type Skill } from '../../core/skill.js';
import { buildDepGraph, getDependents } from '../../core/deps.js';
import type { LinkRecord } from '../../core/state.js';
import { deploy, undeploy, deployToProject, undeployProject } from '../../deploy/engine.js';
import { readMeta, writeMeta } from '../../core/meta.js';
import { SkillList } from '../components/SkillList.js';
import { HelpBar } from '../components/HelpBar.js';
import { ConfirmDialog } from '../components/ConfirmDialog.js';
import { Divider } from '../components/Divider.js';
import { resolveProjectRoot } from '../../fs/paths.js';
import { colors, symbols } from '../theme.js';
import type { ScreenName } from '../theme.js';
import { clampIndex } from '../utils/clampIndex.js';
import { isTerminalTooSmall, rowsAvailable } from '../utils/layout.js';
import { TerminalSizeWarning } from '../components/TerminalSizeWarning.js';

interface SkillBrowserScreenProps {
  skills: Skill[];
  links: LinkRecord[];
  onNavigate: (screen: ScreenName) => void;
  onSelectSkill: (slug: string) => void;
  onRefresh: () => void;
  onTextInputChange?: (active: boolean) => void;
}

type FilterOption = 'all' | 'cc' | 'codex' | 'project' | 'undeployed' | 'remote';

type Step = 'main' | 'confirm-delete' | 'confirm-bulk-delete';

export function SkillBrowserScreen({
  skills,
  links,
  onNavigate,
  onSelectSkill,
  onRefresh,
  onTextInputChange,
}: SkillBrowserScreenProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [filter, setFilter] = useState<FilterOption>('all');
  const [step, setStep] = useState<Step>('main');
  const [deleteTarget, setDeleteTarget] = useState('');
  const [dependents, setDependents] = useState<string[]>([]);
  const [selectedSlugs, setSelectedSlugs] = useState<Set<string>>(new Set());
  const [bulkDeleteTargets, setBulkDeleteTargets] = useState<string[]>([]);
  const [bulkDeleteWarning, setBulkDeleteWarning] = useState('');
  const [deployScope, setDeployScope] = useState<'user' | 'project'>('user');
  const [deployTools, setDeployTools] = useState<{ cc: boolean; codex: boolean }>({ cc: true, codex: true });
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error'>('success');

  const projectRoot = resolveProjectRoot(process.cwd());
  const hasProjectLinks = links.some((l) => l.scope === 'project' && l.projectRoot === projectRoot);

  // Only consider links in user scope or the current project
  const relevantLinks = useMemo(
    () =>
      links.filter((l) => {
        const scope = l.scope ?? 'user';
        if (scope === 'user') return true;
        return scope === 'project' && l.projectRoot === projectRoot;
      }),
    [links, projectRoot],
  );

  const filteredSkills = useMemo(() => {
    let result = skills;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (s) =>
          s.slug.includes(q) ||
          s.name.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          s.tags.some((t) => t.toLowerCase().includes(q)),
      );
    }

    if (filter === 'cc') {
      result = result.filter((s) => relevantLinks.some((l) => l.slug === s.slug && l.tool === 'cc'));
    } else if (filter === 'codex') {
      result = result.filter((s) => relevantLinks.some((l) => l.slug === s.slug && l.tool === 'codex'));
    } else if (filter === 'project') {
      result = result.filter((s) =>
        relevantLinks.some((l) => l.slug === s.slug && l.scope === 'project' && l.projectRoot === projectRoot),
      );
    } else if (filter === 'undeployed') {
      result = result.filter((s) => !relevantLinks.some((l) => l.slug === s.slug));
    } else if (filter === 'remote') {
      result = result.filter((s) => s.meta.source.type === 'git');
    }

    return result;
  }, [skills, relevantLinks, searchQuery, filter, projectRoot]);

  const inputActive = useContext(InputActiveContext);
  const { height, width } = useContext(ScreenSizeContext);
  const hasSelection = selectedSlugs.size > 0;
  // StatusBar(1) + search/filter row marginTop(1)+content(1) + Divider marginTop(1)+content(1) + SkillList marginTop(1)+headers(2) + position(1) + message(~2) + HelpBar marginTop(1)+content(1) = ~13, +2 for HelpBar wrapping on narrow terminals
  // Deploy target bar adds marginTop(1)+content(1) = 2 rows when selection is active
  // Each SkillList item is 2 rows (name + description), so divide available space by 2
  const listMaxHeight = Math.max(4, Math.floor(rowsAvailable(height, 15 + (hasSelection ? 2 : 0), 8) / 2));
  // 27 = max-prefixWidth(4, always account for multi-select) + dots(19) + margin(4)
  const nameWidth = Math.max(20, Math.min(50, width - 27));

  const resetDeployTarget = () => {
    setDeployScope('user');
    setDeployTools({ cc: true, codex: true });
  };

  const toolsLabel = deployTools.cc && deployTools.codex ? 'CC + Codex' : deployTools.cc ? 'CC only' : 'Codex only';

  const bulkDeploy = async () => {
    const slugs = [...selectedSlugs];
    const tools = (Object.entries(deployTools) as ['cc' | 'codex', boolean][]).filter(([, on]) => on).map(([t]) => t);
    if (tools.length === 0) {
      setMessageType('error');
      setMessage('Select at least one tool (c for CC, x for Codex)');
      return;
    }
    let ok = 0;
    let skip = 0;
    let fail = 0;
    for (const slug of slugs) {
      try {
        let anyDeployed = false;
        if (deployScope === 'user') {
          // Ensure deployAs is not 'none' (same pattern as Detail screen)
          const meta = await readMeta(slug);
          for (const t of tools) {
            if (meta.deployAs[t] === 'none') meta.deployAs[t] = 'skill';
          }
          await writeMeta(slug, meta);
          for (const t of tools) {
            const result = await deploy(slug, t);
            if (result.action === 'deployed') anyDeployed = true;
          }
        } else {
          for (const t of tools) {
            const result = await deployToProject(slug, t, projectRoot);
            if (result.action === 'deployed') anyDeployed = true;
          }
        }
        if (anyDeployed) ok++;
        else skip++;
      } catch {
        fail++;
      }
    }
    const scopeLabel = deployScope === 'user' ? 'User' : 'Project';
    setSelectedSlugs(new Set());
    resetDeployTarget();
    onRefresh();
    setMessageType(fail > 0 ? 'error' : 'success');
    const parts: string[] = [];
    if (ok > 0) parts.push(`Deployed ${ok} skill${ok !== 1 ? 's' : ''} to ${toolsLabel} (${scopeLabel})`);
    if (skip > 0) parts.push(`${skip} already deployed`);
    if (fail > 0) parts.push(`${fail} failed`);
    setMessage(parts.join('; ') || 'No changes');
  };

  const bulkUndeploy = async () => {
    const slugs = [...selectedSlugs];
    const noToolSelected = !deployTools.cc && !deployTools.codex;
    // When no tools are toggled on ("undeploy only" mode), undeploy from both
    const tools: ('cc' | 'codex')[] = noToolSelected
      ? ['cc', 'codex']
      : (Object.entries(deployTools) as ['cc' | 'codex', boolean][]).filter(([, on]) => on).map(([t]) => t);
    let ok = 0;
    let skip = 0;
    let fail = 0;
    for (const slug of slugs) {
      try {
        let anyUndeployed = false;
        for (const t of tools) {
          const result =
            deployScope === 'project' ? await undeployProject(slug, t, projectRoot) : await undeploy(slug, t);
          if (result.action === 'undeployed') anyUndeployed = true;
        }
        if (anyUndeployed) ok++;
        else skip++;
      } catch {
        fail++;
      }
    }
    const scopeLabel = deployScope === 'user' ? 'User' : 'Project';
    setSelectedSlugs(new Set());
    resetDeployTarget();
    onRefresh();
    setMessageType(fail > 0 ? 'error' : 'success');
    const parts: string[] = [];
    const undeployLabel = noToolSelected ? 'CC + Codex' : toolsLabel;
    if (ok > 0) parts.push(`Undeployed ${ok} skill${ok !== 1 ? 's' : ''} from ${undeployLabel} (${scopeLabel})`);
    if (skip > 0) parts.push(`${skip} already undeployed`);
    if (fail > 0) parts.push(`${fail} failed`);
    setMessage(parts.join('; ') || 'No changes');
  };

  const startBulkDelete = async () => {
    const slugs = [...selectedSlugs];
    setBulkDeleteTargets(slugs);
    try {
      const graph = await buildDepGraph();
      const allDeps: string[] = [];
      for (const slug of slugs) {
        const deps = getDependents(slug, graph);
        // Only warn about dependents that are NOT also being deleted
        for (const d of deps) {
          if (!selectedSlugs.has(d) && !allDeps.includes(d)) allDeps.push(d);
        }
      }
      setBulkDeleteWarning(allDeps.length > 0 ? `Other skills depend on these: ${allDeps.join(', ')}` : '');
    } catch {
      setBulkDeleteWarning('');
    }
    setStep('confirm-bulk-delete');
  };

  const executeBulkDelete = async () => {
    const slugs = bulkDeleteTargets;
    let ok = 0;
    let fail = 0;
    for (const slug of slugs) {
      try {
        await deleteSkill(slug);
        ok++;
      } catch {
        fail++;
      }
    }
    setSelectedSlugs(new Set());
    resetDeployTarget();
    setBulkDeleteTargets([]);
    setBulkDeleteWarning('');
    onRefresh();
    setMessageType(fail === 0 ? 'success' : 'error');
    setMessage(
      fail === 0
        ? `Deleted ${ok} skill${ok !== 1 ? 's' : ''}`
        : `Deleted ${ok}/${slugs.length} skills (${fail} failed)`,
    );
  };

  useInput(
    (input, key) => {
      // Block all keys except Esc when terminal is too small for the UI
      if (isTerminalTooSmall(width, height, 90, 24)) {
        if (!key.escape) return;
      }

      // Confirm single-delete step
      if (step === 'confirm-delete') {
        if (input === 'y' && deleteTarget) {
          setStep('main');
          void (async () => {
            try {
              await deleteSkill(deleteTarget);
              setMessageType('success');
              setMessage(`Deleted "${deleteTarget}"`);
              onRefresh();
            } catch (err) {
              setMessageType('error');
              setMessage(`Delete failed: ${err instanceof Error ? err.message : String(err)}`);
            }
            setDeleteTarget('');
            setDependents([]);
          })();
        }
        if (input === 'n' || key.escape) {
          setStep('main');
          setDeleteTarget('');
          setDependents([]);
        }
        return;
      }

      // Confirm bulk-delete step
      if (step === 'confirm-bulk-delete') {
        if (input === 'y') {
          setStep('main');
          void executeBulkDelete();
        }
        if (input === 'n' || key.escape) {
          setStep('main');
          setBulkDeleteTargets([]);
          setBulkDeleteWarning('');
        }
        return;
      }

      // Search uses manual char-by-char accumulation (no cursor editing) rather than
      // <TextInput> from @inkjs/ui. This keeps the interaction model simple — search mode
      // is a filter overlay within useInput, not a separate focused component.
      if (searching) {
        if (key.escape) {
          setSearching(false);
          onTextInputChange?.(false);
          setSearchQuery('');
          setSelectedSlugs(new Set());
          resetDeployTarget();
        } else if (key.return) {
          setSearching(false);
          onTextInputChange?.(false);
        } else if (key.backspace || key.delete) {
          setSearchQuery((q) => q.slice(0, -1));
        } else if (input && !key.ctrl) {
          setSearchQuery((q) => q + input);
        }
        return;
      }

      if (input === 'j' || key.downArrow) {
        setSelectedIndex((i) => clampIndex(filteredSkills.length, i + 1));
      }
      if (input === 'k' || key.upArrow) {
        setSelectedIndex((i) => Math.max(i - 1, 0));
      }
      if (key.return && filteredSkills[selectedIndex]) {
        onSelectSkill(filteredSkills[selectedIndex].slug);
        onNavigate('detail');
      }
      if (input === '/') {
        setSearching(true);
        onTextInputChange?.(true);
      }
      if (key.escape) {
        if (hasSelection) {
          setSelectedSlugs(new Set());
          resetDeployTarget();
        } else {
          onNavigate('dashboard');
        }
      }
      if (input === 'f') {
        const filters: FilterOption[] = hasProjectLinks
          ? ['all', 'cc', 'codex', 'project', 'undeployed', 'remote']
          : ['all', 'cc', 'codex', 'undeployed', 'remote'];
        const idx = filters.indexOf(filter);
        setFilter(filters[(idx + 1) % filters.length]);
        setSelectedIndex(0);
        setSelectedSlugs(new Set());
        resetDeployTarget();
      }
      // Space — toggle multi-select on current skill
      if (input === ' ' && filteredSkills[selectedIndex]) {
        const slug = filteredSkills[selectedIndex].slug;
        setSelectedSlugs((prev) => {
          const next = new Set(prev);
          if (next.has(slug)) next.delete(slug);
          else next.add(slug);
          return next;
        });
      }
      // Selection-mode key handlers: scope/tool targeting, bulk deploy/undeploy
      if (hasSelection) {
        if (key.tab) {
          setDeployScope((s) => (s === 'user' ? 'project' : 'user'));
        }
        if (input === 'c') {
          setDeployTools((prev) => ({ ...prev, cc: !prev.cc }));
        }
        if (input === 'x') {
          setDeployTools((prev) => ({ ...prev, codex: !prev.codex }));
        }
      }
      // Bulk deploy
      if (input === '+' && hasSelection) {
        void bulkDeploy();
      }
      // Bulk undeploy
      if (input === '-' && hasSelection) {
        void bulkUndeploy();
      }
      // Delete — bulk if selection, single otherwise
      if (input === 'D') {
        if (hasSelection) {
          void startBulkDelete();
        } else if (filteredSkills[selectedIndex]) {
          const slug = filteredSkills[selectedIndex].slug;
          setDeleteTarget(slug);
          void (async () => {
            try {
              const graph = await buildDepGraph();
              const deps = getDependents(slug, graph);
              setDependents(deps);
            } catch {
              setDependents([]);
            }
            setStep('confirm-delete');
          })();
        }
      }
    },
    { isActive: inputActive },
  );

  const filters: FilterOption[] = hasProjectLinks
    ? ['all', 'cc', 'codex', 'project', 'undeployed', 'remote']
    : ['all', 'cc', 'codex', 'undeployed', 'remote'];

  if (isTerminalTooSmall(width, height, 90, 24)) {
    return <TerminalSizeWarning screenName="Browser" width={width} height={height} minWidth={90} minHeight={24} />;
  }

  if (step === 'confirm-delete' && deleteTarget) {
    return (
      <ConfirmDialog
        title={`Delete "${deleteTarget}" permanently?`}
        message="This will undeploy from all tools/scopes and remove the skill from the canonical store."
        warning={dependents.length > 0 ? `Other skills depend on this: ${dependents.join(', ')}` : undefined}
        confirmLabel="delete"
        danger
      />
    );
  }

  if (step === 'confirm-bulk-delete' && bulkDeleteTargets.length > 0) {
    return (
      <ConfirmDialog
        title={`Delete ${bulkDeleteTargets.length} skills permanently?`}
        message={bulkDeleteTargets.join(', ')}
        warning={bulkDeleteWarning || undefined}
        confirmLabel="delete all"
        danger
      />
    );
  }

  return (
    <Box flexDirection="column">
      <Box marginTop={1} justifyContent="space-between">
        <Box>
          {searching ? (
            <Text color={colors.primary}>
              / {searchQuery}
              <Text color={colors.muted}>_</Text>
            </Text>
          ) : searchQuery ? (
            <Text color={colors.muted}>/ {searchQuery}</Text>
          ) : (
            <Text color={colors.dim}>/ search...</Text>
          )}
        </Box>
        <Box gap={1}>
          <Text color={colors.dim}>Filter:</Text>
          {filters.map((f) => (
            <Text key={f} color={f === filter ? colors.primary : colors.dim} bold={f === filter}>
              {f}
            </Text>
          ))}
        </Box>
      </Box>

      <Divider
        label="Results"
        rightLabel={hasSelection ? `${selectedSlugs.size} selected` : `${filteredSkills.length}/${skills.length}`}
      />

      {hasSelection && (
        <Box marginTop={1} gap={1}>
          <Text color={colors.muted}>Target</Text>
          <Text color={deployScope === 'user' ? colors.primary : colors.dim} bold={deployScope === 'user'}>
            {deployScope === 'user' ? `${symbols.selected} User` : '  User'}
          </Text>
          <Text color={deployScope === 'project' ? colors.primary : colors.dim} bold={deployScope === 'project'}>
            {deployScope === 'project' ? `${symbols.selected} Project` : '  Project'}
          </Text>
          <Text color={colors.dim}>{symbols.separator}</Text>
          <Text color={deployTools.cc ? colors.cc : colors.dim} bold={deployTools.cc}>
            {deployTools.cc ? `${symbols.deployed} CC` : `${symbols.notDeployed} CC`}
          </Text>
          <Text color={deployTools.codex ? colors.codex : colors.dim} bold={deployTools.codex}>
            {deployTools.codex ? `${symbols.deployed} Codex` : `${symbols.notDeployed} Codex`}
          </Text>
          {!deployTools.cc && !deployTools.codex && <Text color={colors.warning}>(undeploy only)</Text>}
          <Text color={colors.dim}>{symbols.separator}</Text>
          <Text color={colors.dim}>
            Tab<Text color={colors.muted}> scope</Text> c/x<Text color={colors.muted}> tools</Text>
          </Text>
        </Box>
      )}

      {filteredSkills.length > 0 ? (
        <Box marginTop={1} flexDirection="column">
          <SkillList
            skills={filteredSkills}
            links={links}
            selectedIndex={selectedIndex}
            projectRoot={projectRoot}
            showDescription={true}
            descriptionLength={48}
            maxHeight={listMaxHeight}
            selectedSlugs={hasSelection ? selectedSlugs : undefined}
            nameWidth={nameWidth}
          />
        </Box>
      ) : (
        <Box marginTop={1}>
          <Text color={colors.muted}>
            {searchQuery && filter !== 'all'
              ? `No skills match "${searchQuery}" with filter '${filter}'`
              : searchQuery
                ? 'No matching skills'
                : filter !== 'all'
                  ? `No skills with filter '${filter}'`
                  : 'No skills found'}
          </Text>
        </Box>
      )}

      {message && (
        <Box marginTop={1}>
          <Text color={messageType === 'success' ? colors.success : colors.error}>{message}</Text>
        </Box>
      )}

      <HelpBar
        bindings={
          hasSelection
            ? [
                { key: 'Space', action: 'select' },
                { key: '+', action: 'deploy' },
                { key: '-', action: 'undeploy' },
                { key: 'D', action: 'delete all' },
                { key: 'Esc', action: 'clear selection' },
              ]
            : [
                { key: 'j/k', action: 'navigate' },
                { key: 'Space', action: 'select' },
                { key: '/', action: 'search' },
                { key: 'f', action: 'filter' },
                { key: 'D', action: 'delete' },
                { key: '?', action: 'help' },
                { key: 'Esc', action: 'back' },
              ]
        }
      />
    </Box>
  );
}
