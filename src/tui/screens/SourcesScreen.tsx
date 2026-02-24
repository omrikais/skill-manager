import React, { useState, useRef, useEffect, useContext } from 'react';
import { Box, Text, useInput } from 'ink';
import { InputActiveContext, ScreenSizeContext } from '../App.js';
import { Spinner, TextInput } from '@inkjs/ui';
import { useSources, type SourceWithSkills } from '../hooks/useSources.js';
import { HelpBar } from '../components/HelpBar.js';
import { ConfirmDialog } from '../components/ConfirmDialog.js';
import { DiffView } from '../components/DiffView.js';
import { Divider } from '../components/Divider.js';
import { computeUnifiedDiff, type DiffHunk } from '../utils/diff.js';
import { colors, symbols } from '../theme.js';
import type { ScreenName } from '../theme.js';
import type { RemoteSkill } from '../../sources/scanner.js';
import { clampIndex } from '../utils/clampIndex.js';
import { truncate } from '../utils/truncate.js';
import { isTerminalTooSmall, rowsAvailable } from '../utils/layout.js';
import { TerminalSizeWarning } from '../components/TerminalSizeWarning.js';

interface SourcesScreenProps {
  onNavigate: (screen: ScreenName) => void;
  onRefresh: () => void;
  onTextInputChange?: (active: boolean) => void;
  onStepChange?: (step: string) => void;
}

type Step = 'list' | 'detail' | 'adding' | 'confirm-update' | 'confirm-delete' | 'show-diff';

export function SourcesScreen({ onNavigate, onRefresh, onTextInputChange, onStepChange }: SourcesScreenProps) {
  const {
    sources,
    loading,
    error,
    syncSource,
    removeSource,
    installSkill,
    checkForUpdate,
    getUpdateContent,
    quickInstall,
  } = useSources();
  const [step, setStep] = useState<Step>('list');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error'>('success');
  const [, setUrlInput] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  // Detail step state
  const [detailIndex, setDetailIndex] = useState(0);
  const [pendingUpdate, setPendingUpdate] = useState<RemoteSkill | null>(null);
  const [deleteTarget, setDeleteTarget] = useState('');

  // Diff view state
  const [diffHunks, setDiffHunks] = useState<DiffHunk[]>([]);
  const [diffScrollOffset, setDiffScrollOffset] = useState(0);
  const [diffSkillName, setDiffSkillName] = useState('');
  const [diffSkill, setDiffSkill] = useState<RemoteSkill | null>(null);

  // Report step changes to parent for help overlay filtering
  useEffect(() => {
    onStepChange?.(step);
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounce escape in the adding step to prevent bracketed paste mode
  // from triggering exit (\x1b can arrive as a separate stdin chunk).
  const escapeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (escapeTimerRef.current) clearTimeout(escapeTimerRef.current);
    },
    [],
  );

  const selectedSource = sources[selectedIndex] as SourceWithSkills | undefined;

  const doAction = async (fn: () => Promise<{ ok: boolean; message: string }>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    const result = await fn();
    setMessage(result.message);
    setMessageType(result.ok ? 'success' : 'error');
    busyRef.current = false;
    setBusy(false);
    onRefresh();
  };

  const handleUrlSubmit = (value: string) => {
    if (!value.trim()) return;
    const raw = value.trim();
    setStep('list');
    setUrlInput('');
    onTextInputChange?.(false);
    void doAction(() => quickInstall(raw));
  };

  const showDiffForSkill = async (skill: RemoteSkill) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const status = await checkForUpdate(skill);
      if (status === 'identical') {
        setMessageType('success');
        setMessage(`"${skill.slug}" is already up to date`);
        setStep('detail');
        setPendingUpdate(null);
        busyRef.current = false;
        setBusy(false);
        return;
      }
      const { local, remote } = await getUpdateContent(skill);
      const hunks = computeUnifiedDiff(local, remote);
      setDiffHunks(hunks);
      setDiffScrollOffset(0);
      setDiffSkillName(skill.slug);
      setDiffSkill(skill);
      setPendingUpdate(null);
      setStep('show-diff');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
      setMessageType('error');
      setStep('detail');
      setPendingUpdate(null);
    }
    busyRef.current = false;
    setBusy(false);
  };

  const inputActive = useContext(InputActiveContext);
  const { height, width } = useContext(ScreenSizeContext);
  // StatusBar(1) + Divider(2) + URL(2) + skills marginTop(1) + scroll indicators(2) + busy/message(~2) + HelpBar(2) = ~12, +2 for HelpBar wrapping on narrow terminals
  const listMaxVisible = rowsAvailable(height, 14, 4);
  // Source list chrome: StatusBar(1) + Divider(2) + marginTop(1) + scroll indicators(2) + busy/message(~2) + HelpBar(2) + buffer(2) = 12
  const sourceListMaxVisible = rowsAvailable(height, 12, 4);
  // Diff view chrome: StatusBar(1) + Divider(2) + scroll indicators(2) + HelpBar(2) = ~7, +2 for wrapping
  const diffMaxHeight = rowsAvailable(height, 9, 4);

  useInput(
    (input, key) => {
      // Block all keys except Esc when terminal is too small for the UI
      if (isTerminalTooSmall(width, height, 90, 24)) {
        if (!key.escape) return;
      }

      if (busy) return;

      if (step === 'show-diff') {
        if (key.escape) {
          setStep('detail');
          return;
        }
        const totalDiffLines = diffHunks.reduce((sum, h) => sum + h.lines.length + 1, 0);
        const maxScroll = Math.max(0, totalDiffLines - diffMaxHeight);
        if (input === 'j' || key.downArrow) {
          setDiffScrollOffset((o) => Math.min(o + 1, maxScroll));
        }
        if (input === 'k' || key.upArrow) {
          setDiffScrollOffset((o) => Math.max(o - 1, 0));
        }
        if (input === 'y' && diffSkill) {
          setStep('detail');
          const skill = diffSkill;
          setDiffSkill(null);
          setDiffHunks([]);
          void doAction(() => installSkill(skill));
        }
        return;
      }

      if (step === 'confirm-delete') {
        if (input === 'y' && deleteTarget) {
          setStep('list');
          const name = deleteTarget;
          setDeleteTarget('');
          void doAction(() => removeSource(name));
        }
        if (input === 'n' || key.escape) {
          setStep('list');
          setDeleteTarget('');
        }
        return;
      }

      if (step === 'confirm-update') {
        if (input === 'y' && pendingUpdate) {
          setStep('detail');
          const skill = pendingUpdate;
          setPendingUpdate(null);
          void doAction(() => installSkill(skill));
          return;
        }
        if (input === 'd' && pendingUpdate) {
          void showDiffForSkill(pendingUpdate);
          return;
        }
        if (input === 'n' || key.escape) {
          setStep('detail');
          setPendingUpdate(null);
          return;
        }
        return;
      }

      if (step === 'adding') {
        // Cancel pending escape if real input arrives (bracketed paste sequence)
        if (escapeTimerRef.current && !key.escape) {
          clearTimeout(escapeTimerRef.current);
          escapeTimerRef.current = null;
        }
        if (key.escape) {
          // Debounce: \x1b can arrive as a separate chunk from bracketed paste.
          // Wait briefly to confirm it isn't the start of an escape sequence.
          if (escapeTimerRef.current) clearTimeout(escapeTimerRef.current);
          escapeTimerRef.current = setTimeout(() => {
            escapeTimerRef.current = null;
            setStep('list');
            setUrlInput('');
            onTextInputChange?.(false);
          }, 50);
          return;
        }
        // TextInput handles all other input (characters, backspace, enter)
        return;
      }

      if (step === 'detail') {
        const skills = selectedSource?.skills ?? [];
        if (key.escape) {
          setStep('list');
          setDetailIndex(0);
          return;
        }
        if (input === 'j' || key.downArrow) {
          setDetailIndex((i) => clampIndex(skills.length, i + 1));
        }
        if (input === 'k' || key.upArrow) {
          setDetailIndex((i) => Math.max(i - 1, 0));
        }
        if (input === 'd' && skills[detailIndex]?.installed) {
          void showDiffForSkill(skills[detailIndex]);
        }
        if (input === 'i' && skills[detailIndex]) {
          const skill = skills[detailIndex];
          if (!skill.installed) {
            void doAction(() => installSkill(skill));
          } else {
            // Check if remote content differs from local
            if (!busyRef.current) {
              void (async () => {
                busyRef.current = true;
                setBusy(true);
                try {
                  const status = await checkForUpdate(skill);
                  if (status === 'identical') {
                    setMessageType('success');
                    setMessage(`"${skill.slug}" is already up to date`);
                  } else {
                    setPendingUpdate(skill);
                    setStep('confirm-update');
                  }
                } catch (err) {
                  setMessage(err instanceof Error ? err.message : String(err));
                  setMessageType('error');
                }
                busyRef.current = false;
                setBusy(false);
              })();
            }
          }
        }
        if (input === 'I' && !busyRef.current) {
          void (async () => {
            busyRef.current = true;
            setBusy(true);
            try {
              let count = 0;
              const errors: string[] = [];
              for (const skill of skills) {
                try {
                  if (!skill.installed) {
                    const result = await installSkill(skill);
                    if (result.ok) count++;
                    else errors.push(`${skill.slug}: ${result.message}`);
                  } else {
                    const status = await checkForUpdate(skill);
                    if (status === 'changed') {
                      const result = await installSkill(skill);
                      if (result.ok) count++;
                      else errors.push(`${skill.slug}: ${result.message}`);
                    }
                  }
                } catch (err) {
                  errors.push(`${skill.slug}: ${err instanceof Error ? err.message : String(err)}`);
                }
              }
              if (errors.length > 0) {
                setMessage(`${count} installed/updated, ${errors.length} failed: ${errors[0]}`);
                setMessageType('error');
              } else {
                setMessage(count > 0 ? `Installed/updated ${count} skills` : 'All skills are up to date');
                setMessageType('success');
              }
              onRefresh();
            } finally {
              busyRef.current = false;
              setBusy(false);
            }
          })();
        }
        return;
      }

      // List step
      if (key.escape) {
        onNavigate('dashboard');
        return;
      }
      if (input === 'j' || key.downArrow) {
        setSelectedIndex((i) => clampIndex(sources.length, i + 1));
      }
      if (input === 'k' || key.upArrow) {
        setSelectedIndex((i) => Math.max(i - 1, 0));
      }
      if (key.return && selectedSource) {
        setStep('detail');
        setDetailIndex(0);
      }
      if (input === 'a') {
        setStep('adding');
        setUrlInput('');
        onTextInputChange?.(true);
      }
      if (input === 's' && selectedSource) {
        void doAction(() => syncSource(selectedSource.entry.name));
      }
      if (input === 'D' && selectedSource) {
        setDeleteTarget(selectedSource.entry.name);
        setStep('confirm-delete');
      }
    },
    { isActive: inputActive },
  );

  if (loading) {
    return (
      <Box marginTop={1}>
        <Spinner label="Loading sources..." />
      </Box>
    );
  }

  if (isTerminalTooSmall(width, height, 90, 24)) {
    return <TerminalSizeWarning screenName="Sources" width={width} height={height} minWidth={90} minHeight={24} />;
  }

  if (step === 'confirm-delete' && deleteTarget) {
    return (
      <ConfirmDialog
        title={`Remove source "${deleteTarget}"?`}
        message="This removes the source registration. Imported skills are not affected."
        confirmLabel="remove"
        danger
      />
    );
  }

  if (step === 'adding') {
    return (
      <Box flexDirection="column" marginTop={1}>
        <Text color={colors.text} bold>
          Add Source
        </Text>
        <Box marginTop={1}>
          <Text color={colors.primary}>URL: </Text>
          <TextInput
            placeholder="URL, shorthand (user/repo), or install command"
            onChange={setUrlInput}
            onSubmit={handleUrlSubmit}
          />
        </Box>
        <HelpBar
          bindings={[
            { key: 'Enter', action: 'confirm' },
            { key: 'Esc', action: 'cancel' },
          ]}
        />
      </Box>
    );
  }

  if (step === 'show-diff') {
    return (
      <DiffView skillName={diffSkillName} hunks={diffHunks} scrollOffset={diffScrollOffset} maxHeight={diffMaxHeight} />
    );
  }

  if (step === 'confirm-update' && pendingUpdate) {
    return (
      <ConfirmDialog
        title={`Skill "${pendingUpdate.slug}" has changed`}
        message={`The remote version differs from your local copy. Update to the version from ${selectedSource?.entry.name ?? 'source'}?`}
        confirmLabel="update"
        cancelLabel="skip"
        bindings={[
          { key: 'y', action: 'update' },
          { key: 'd', action: 'view diff' },
          { key: 'n', action: 'skip' },
          { key: 'Esc', action: 'cancel' },
        ]}
      />
    );
  }

  if (step === 'detail' && selectedSource) {
    return (
      <SourceDetailView
        source={selectedSource}
        selectedIndex={detailIndex}
        busy={busy}
        message={message}
        messageType={messageType}
        maxVisible={listMaxVisible}
      />
    );
  }

  // List step
  return (
    <Box flexDirection="column">
      <Divider label="Sources" rightLabel={`${sources.length}`} />

      {sources.length === 0 ? (
        <Box marginTop={1}>
          <Text color={colors.warning}>
            No sources configured. Press <Text bold>a</Text> to add one.
          </Text>
        </Box>
      ) : (
        <Box marginTop={1} flexDirection="column">
          {(() => {
            const start = Math.max(
              0,
              Math.min(selectedIndex - sourceListMaxVisible + 1, sources.length - sourceListMaxVisible),
            );
            const visible = sources.slice(start, start + sourceListMaxVisible);
            return (
              <>
                {start > 0 && <Text color={colors.dim}> ▴ {start} more above</Text>}
                {visible.map((src, vi) => {
                  const i = start + vi;
                  return (
                    <Box key={src.entry.name}>
                      <Text color={i === selectedIndex ? colors.primary : colors.text}>
                        {i === selectedIndex ? `${symbols.selected} ` : '  '}
                      </Text>
                      <Text color={i === selectedIndex ? colors.accent : colors.text}>{src.entry.name.padEnd(24)}</Text>
                      <Text color={colors.muted}>{String(src.skills.length).padStart(3)} skills</Text>
                      <Text color={colors.dim}>
                        {'  '}
                        {src.entry.lastSync ? new Date(src.entry.lastSync).toLocaleDateString() : 'never synced'}
                      </Text>
                      {src.entry.lastError && <Text color={colors.error}>{'  '}error</Text>}
                    </Box>
                  );
                })}
                {start + sourceListMaxVisible < sources.length && (
                  <Text color={colors.dim}> ▾ {sources.length - start - sourceListMaxVisible} more below</Text>
                )}
              </>
            );
          })()}
        </Box>
      )}

      {busy && (
        <Box marginTop={1}>
          <Spinner label="Working..." />
        </Box>
      )}

      {message && !busy && (
        <Box marginTop={1}>
          <Text color={messageType === 'success' ? colors.success : colors.error}>{truncate(message, width - 2)}</Text>
        </Box>
      )}

      {error && (
        <Box marginTop={1}>
          <Text color={colors.error}>{truncate(error, width - 2)}</Text>
        </Box>
      )}

      <HelpBar
        bindings={[
          { key: 'j/k', action: 'navigate' },
          { key: 'Enter', action: 'detail' },
          { key: 'a', action: 'add' },
          { key: 's', action: 'sync' },
          { key: 'D', action: 'remove' },
          { key: '?', action: 'help' },
          { key: 'Esc', action: 'back' },
        ]}
      />
    </Box>
  );
}

function SourceDetailView({
  source,
  selectedIndex,
  busy,
  message,
  messageType,
  maxVisible,
}: {
  source: SourceWithSkills;
  selectedIndex: number;
  busy: boolean;
  message: string;
  messageType: 'success' | 'error';
  maxVisible: number;
}) {
  const { width } = useContext(ScreenSizeContext);
  const skills = source.skills;

  return (
    <Box flexDirection="column">
      <Divider label={source.entry.name} rightLabel={`${skills.length} skills`} />

      <Box marginTop={1}>
        <Text color={colors.dim}>{truncate(source.entry.url, width - 4)}</Text>
      </Box>

      {skills.length === 0 ? (
        <Box marginTop={1}>
          <Text color={colors.warning}>No skills found in this repository.</Text>
        </Box>
      ) : (
        <Box marginTop={1} flexDirection="column">
          {(() => {
            const start = Math.max(0, Math.min(selectedIndex - maxVisible + 1, skills.length - maxVisible));
            const visible = skills.slice(start, start + maxVisible);
            return (
              <>
                {start > 0 && <Text color={colors.dim}> ▴ {start} more above</Text>}
                {visible.map((skill, vi) => {
                  const i = start + vi;
                  return (
                    <Box key={skill.slug}>
                      <Text color={i === selectedIndex ? colors.primary : colors.text}>
                        {i === selectedIndex ? `${symbols.selected} ` : '  '}
                      </Text>
                      <Text
                        color={skill.installed ? colors.success : i === selectedIndex ? colors.accent : colors.text}
                      >
                        {skill.installed ? symbols.healthy : symbols.notDeployed} {skill.slug.padEnd(28)}
                      </Text>
                      <Text color={colors.muted}>{skill.name !== skill.slug ? skill.name : ''}</Text>
                    </Box>
                  );
                })}
                {start + maxVisible < skills.length && (
                  <Text color={colors.dim}> ▾ {skills.length - start - maxVisible} more below</Text>
                )}
              </>
            );
          })()}
        </Box>
      )}

      {busy && (
        <Box marginTop={1}>
          <Spinner label="Installing..." />
        </Box>
      )}

      {message && !busy && (
        <Box marginTop={1}>
          <Text color={messageType === 'success' ? colors.success : colors.error}>{truncate(message, width - 2)}</Text>
        </Box>
      )}

      <HelpBar
        bindings={[
          { key: 'j/k', action: 'navigate' },
          { key: 'i', action: 'install/update' },
          { key: 'I', action: 'install/update all' },
          { key: 'd', action: 'view diff' },
          { key: '?', action: 'help' },
          { key: 'Esc', action: 'back' },
        ]}
      />
    </Box>
  );
}
