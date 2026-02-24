import React, { useState, useEffect, useContext } from 'react';
import { Box, Text, useInput } from 'ink';
import { InputActiveContext, ScreenSizeContext } from '../App.js';
import { Spinner } from '@inkjs/ui';
import { scanAll, type FullScanResult } from '../../fs/scanner.js';
import { deduplicateFiles, type DedupGroup } from '../../core/dedup.js';
import { importCommand } from '../../commands/import.js';
import { HelpBar } from '../components/HelpBar.js';
import { Divider } from '../components/Divider.js';
import { colors } from '../theme.js';
import type { ScreenName } from '../theme.js';
import { clampIndex } from '../utils/clampIndex.js';

interface ImportWizardScreenProps {
  onNavigate: (screen: ScreenName) => void;
  onRefresh: () => void;
}

type Step = 'scan' | 'review' | 'execute' | 'done';

export function ImportWizardScreen({ onNavigate, onRefresh }: ImportWizardScreenProps) {
  const [step, setStep] = useState<Step>('scan');
  const [scanResult, setScanResult] = useState<FullScanResult | null>(null);
  const [groups, setGroups] = useState<DedupGroup[]>([]);
  const [executing, setExecuting] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [deselected, setDeselected] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      const result = await scanAll();
      setScanResult(result);
      const dedupGroups = deduplicateFiles(result.allFiles);
      setGroups(dedupGroups);
      setStep('review');
    })();
  }, []);

  const inputActive = useContext(InputActiveContext);
  const { height } = useContext(ScreenSizeContext);
  // StatusBar(1) + scan results ~4 lines + summary(2) + Divider(2) + HelpBar(2) + position indicator(1) = ~12
  const maxVisible = Math.max(4, height - 12);

  const selectedCount = groups.length - deselected.size;

  useInput(
    (input, key) => {
      if (key.escape) {
        onNavigate('dashboard');
      }
      if (step === 'done' && key.return) {
        onNavigate('dashboard');
        return;
      }
      if (step === 'review') {
        if (input === 'j' || key.downArrow) {
          setSelectedIndex((i) => clampIndex(groups.length, i + 1));
        }
        if (input === 'k' || key.upArrow) {
          setSelectedIndex((i) => Math.max(i - 1, 0));
        }
        if (input === ' ' && groups[selectedIndex]) {
          const slug = groups[selectedIndex].slug;
          setDeselected((prev) => {
            const next = new Set(prev);
            if (next.has(slug)) next.delete(slug);
            else next.add(slug);
            return next;
          });
        }
        if (input === 'a') {
          setDeselected(new Set());
        }
        if (input === 'n') {
          setDeselected(new Set(groups.map((g) => g.slug)));
        }
        if (key.return && selectedCount > 0) {
          setStep('execute');
          setExecuting(true);
          const selectedSlugs = groups.filter((g) => !deselected.has(g.slug)).map((g) => g.slug);
          (async () => {
            try {
              await importCommand({ from: 'all', slugs: selectedSlugs });
            } catch {
              // Import errors are logged by the command itself
            }
            setExecuting(false);
            setStep('done');
            onRefresh();
          })();
        }
      }
    },
    { isActive: inputActive },
  );

  if (step === 'scan') {
    return (
      <Box flexDirection="column">
        <Spinner label="Scanning skill directories..." />
      </Box>
    );
  }

  if (step === 'review' && scanResult) {
    const dupeCount = scanResult.allFiles.length - groups.length;

    // Compute visible window centered on selectedIndex
    const start = Math.max(0, Math.min(selectedIndex - Math.floor(maxVisible / 2), groups.length - maxVisible));
    const visibleStart = Math.max(0, start);
    const visible = groups.slice(visibleStart, visibleStart + maxVisible);

    return (
      <Box flexDirection="column">
        <Box marginTop={1} flexDirection="column">
          {scanResult.scans.map((scan) => (
            <Text key={scan.source} color={colors.muted}>
              {scan.files.length > 0 ? '\u2713' : '\u2013'} {scan.source}: {scan.files.length} files
            </Text>
          ))}
        </Box>

        <Box marginTop={1} gap={2}>
          <Text color={colors.text}>
            Unique: <Text bold>{groups.length}</Text>
          </Text>
          {dupeCount > 0 && (
            <Text color={colors.accent}>
              Duplicates: <Text bold>{dupeCount}</Text>
            </Text>
          )}
        </Box>

        <Divider label="Skills to import" rightLabel={`${selectedCount}/${groups.length} selected`} />

        <Box marginTop={1} flexDirection="column">
          {visible.map((g, i) => {
            const idx = visibleStart + i;
            const isCursor = idx === selectedIndex;
            const isDeselected = deselected.has(g.slug);
            const sources = g.files.map((f) => f.source).join(', ');
            return (
              <Text key={g.slug}>
                <Text color={isDeselected ? colors.dim : colors.primary}>{isDeselected ? '\u25FB ' : '\u25FC '}</Text>
                <Text color={isCursor ? colors.primary : colors.muted} bold={isCursor}>
                  {isCursor ? '\u25B8 ' : '  '}
                </Text>
                <Text color={isCursor ? colors.primary : isDeselected ? colors.dim : colors.text} bold={isCursor}>
                  {g.slug}
                </Text>
                <Text color={colors.muted}>{` (${sources})`}</Text>
                {g.files.length > 1 && <Text color={colors.accent}> [deduped]</Text>}
              </Text>
            );
          })}
          {groups.length > maxVisible && <Text color={colors.dim}>{`  (${selectedIndex + 1}/${groups.length})`}</Text>}
        </Box>

        <HelpBar
          bindings={[
            { key: 'Enter', action: `import ${selectedCount}` },
            { key: 'Space', action: 'toggle' },
            { key: 'a', action: 'all' },
            { key: 'n', action: 'none' },
            { key: 'j/k', action: 'navigate' },
            { key: '?', action: 'help' },
            { key: 'Esc', action: 'cancel' },
          ]}
        />
      </Box>
    );
  }

  if (step === 'execute') {
    return (
      <Box flexDirection="column">
        {executing ? <Spinner label="Importing skills..." /> : <Text color={colors.success}>Import complete!</Text>}
      </Box>
    );
  }

  // done
  return (
    <Box flexDirection="column">
      <Text bold color={colors.success}>
        Import Complete!
      </Text>
      <Text color={colors.muted}>Press Esc or Enter to return to dashboard.</Text>
    </Box>
  );
}
