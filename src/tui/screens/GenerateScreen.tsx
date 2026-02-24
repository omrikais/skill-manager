import React, { useState, useMemo, useContext } from 'react';
import { Box, Text, useInput } from 'ink';
import { InputActiveContext, ScreenSizeContext } from '../App.js';
import { Spinner } from '@inkjs/ui';
import { useGenerate, type GenerateState } from '../hooks/useGenerate.js';
import { renderMarkdownToTerminal } from '../../utils/markdown.js';
import { HelpBar } from '../components/HelpBar.js';
import { Divider } from '../components/Divider.js';
import { colors, symbols } from '../theme.js';
import type { ScreenName } from '../theme.js';
import { isTerminalTooSmall, rowsAvailable } from '../utils/layout.js';
import { TerminalSizeWarning } from '../components/TerminalSizeWarning.js';

interface GenerateScreenProps {
  onNavigate: (screen: ScreenName) => void;
}

type Step = 'configure' | 'preview' | 'result';

interface ConfigOption {
  key: keyof GenerateState;
  label: string;
  values: string[];
  display: (v: string) => string;
}

const CONFIG_OPTIONS: ConfigOption[] = [
  {
    key: 'target',
    label: 'Target',
    values: ['claude-md', 'agents-md', 'both'],
    display: (v) => (v === 'claude-md' ? 'CLAUDE.md' : v === 'agents-md' ? 'AGENTS.md' : 'Both'),
  },
  {
    key: 'mode',
    label: 'Mode',
    values: ['inline', 'reference', 'summary'],
    display: (v) => v,
  },
  {
    key: 'includeSkills',
    label: 'Include Skills',
    values: ['false', 'true'],
    display: (v) => (v === 'true' ? 'Yes' : 'No'),
  },
  {
    key: 'withMcp',
    label: 'Include MCP',
    values: ['false', 'true'],
    display: (v) => (v === 'true' ? 'Yes' : 'No'),
  },
  {
    key: 'symlink',
    label: 'Symlink',
    values: ['none', 'claude-to-agents', 'agents-to-claude'],
    display: (v) => v,
  },
];

// Chrome = StatusBar(1) + Divider(2) + scroll indicators(2) + HelpBar(2) + error margin(1) = ~8, +2 for HelpBar wrapping on narrow terminals
const CHROME_ROWS = 10;

export function GenerateScreen({ onNavigate }: GenerateScreenProps) {
  const { state, updateState, preview, writeResult, error, busy, generatePreview, writeFiles } = useGenerate();

  const [step, setStep] = useState<Step>('configure');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [showRaw, setShowRaw] = useState(false);
  const [previewTargetIdx, setPreviewTargetIdx] = useState(0);

  const previewContent = useMemo(() => {
    if (!preview || preview.targets.length === 0) return null;
    const target = preview.targets[previewTargetIdx] ?? preview.targets[0];
    const raw = target.content;
    const rendered = renderMarkdownToTerminal(raw);
    return {
      target,
      rawLines: raw.split('\n'),
      renderedLines: rendered.split('\n'),
    };
  }, [preview, previewTargetIdx]);

  const visibleLines = previewContent ? (showRaw ? previewContent.rawLines : previewContent.renderedLines) : [];
  const totalLines = visibleLines.length;

  const inputActive = useContext(InputActiveContext);
  const { height, width } = useContext(ScreenSizeContext);
  const maxVisible = rowsAvailable(height, CHROME_ROWS, 6);

  useInput(
    (input, key) => {
      // Block all keys except Esc when terminal is too small for the UI
      if (isTerminalTooSmall(width, height, 90, 24)) {
        if (!key.escape) return;
      }

      if (busy) return;

      if (step === 'configure') {
        if (key.escape) {
          onNavigate('dashboard');
          return;
        }
        if (input === 'j' || key.downArrow) {
          setSelectedIndex((i) => Math.min(i + 1, CONFIG_OPTIONS.length - 1));
        }
        if (input === 'k' || key.upArrow) {
          setSelectedIndex((i) => Math.max(i - 1, 0));
        }
        if (input === ' ' || key.tab) {
          const opt = CONFIG_OPTIONS[selectedIndex];
          const currentVal = String(state[opt.key]);
          const idx = opt.values.indexOf(currentVal);
          const nextIdx = (idx + 1) % opt.values.length;
          const nextVal = opt.values[nextIdx];

          if (opt.key === 'includeSkills' || opt.key === 'withMcp') {
            updateState(opt.key, (nextVal === 'true') as never);
          } else {
            updateState(opt.key, nextVal as never);
          }
        }
        if (key.return) {
          setScrollOffset(0);
          setShowRaw(false);
          setPreviewTargetIdx(0);
          void generatePreview().then(() => setStep('preview'));
        }
      }

      if (step === 'preview') {
        if (key.escape) {
          setStep('configure');
          return;
        }
        const maxScroll = Math.max(0, totalLines - maxVisible);
        if (input === 'j' || key.downArrow) {
          setScrollOffset((o) => Math.min(o + 1, maxScroll));
        }
        if (input === 'k' || key.upArrow) {
          setScrollOffset((o) => Math.max(o - 1, 0));
        }
        if (input === 'd') {
          setScrollOffset((o) => Math.min(o + maxVisible, maxScroll));
        }
        if (input === 'u') {
          setScrollOffset((o) => Math.max(o - maxVisible, 0));
        }
        if (input === 'v') {
          setShowRaw((r) => !r);
          setScrollOffset(0);
        }
        if (input === 't' && preview && preview.targets.length > 1) {
          setPreviewTargetIdx((i) => (i + 1) % preview.targets.length);
          setScrollOffset(0);
        }
        if (key.return) {
          void writeFiles().then(() => setStep('result'));
        }
      }

      if (step === 'result') {
        if (key.escape || key.return) {
          onNavigate('dashboard');
        }
      }
    },
    { isActive: inputActive },
  );

  if (isTerminalTooSmall(width, height, 90, 24)) {
    return <TerminalSizeWarning screenName="Generate" width={width} height={height} minWidth={90} minHeight={24} />;
  }

  // ─── Configure Step ────────────────────────────────────────

  if (step === 'configure') {
    return (
      <Box flexDirection="column">
        <Divider label="Generate" rightLabel="configure" />

        <Box marginTop={1} flexDirection="column">
          {CONFIG_OPTIONS.map((opt, i) => {
            const val = String(state[opt.key]);
            const isSelected = i === selectedIndex;
            const displayed = opt.display(val);
            const valueColor = displayed === 'No' || val === 'none' ? colors.muted : colors.success;
            return (
              <Box key={opt.key}>
                <Text color={isSelected ? colors.primary : colors.text}>
                  {isSelected ? `${symbols.selected} ` : '  '}
                </Text>
                <Text color={isSelected ? colors.accent : colors.text}>{opt.label.padEnd(16)}</Text>
                <Text color={valueColor}>{displayed}</Text>
              </Box>
            );
          })}
        </Box>

        {error && (
          <Box marginTop={1}>
            <Text color={colors.error}>{error}</Text>
          </Box>
        )}

        <HelpBar
          bindings={[
            { key: 'j/k', action: 'navigate' },
            { key: 'Space', action: 'toggle' },
            { key: 'Enter', action: 'preview' },
            { key: '?', action: 'help' },
            { key: 'Esc', action: 'back' },
          ]}
        />
      </Box>
    );
  }

  // ─── Preview Step ──────────────────────────────────────────

  if (step === 'preview') {
    if (busy) {
      return (
        <Box marginTop={1}>
          <Spinner label="Generating preview..." />
        </Box>
      );
    }

    if (!preview || !previewContent) {
      return (
        <Box marginTop={1}>
          <Text color={colors.error}>No preview available. {error}</Text>
        </Box>
      );
    }

    const { target } = previewContent;
    const slice = visibleLines.slice(scrollOffset, scrollOffset + maxVisible);
    const linesAbove = scrollOffset;
    const linesBelow = Math.max(0, totalLines - scrollOffset - maxVisible);

    const helpBindings = [
      { key: 'j/k', action: 'scroll' },
      { key: 'd/u', action: 'page' },
      { key: 'v', action: showRaw ? 'rendered' : 'raw' },
      ...(preview.targets.length > 1 ? [{ key: 't', action: 'switch file' }] : []),
      { key: 'Enter', action: 'write' },
      { key: '?', action: 'help' },
      { key: 'Esc', action: 'back' },
    ];

    return (
      <Box flexDirection="column">
        <Divider
          label={target.fileName}
          rightLabel={`${showRaw ? 'raw' : 'rendered'} (${target.isNew ? 'new' : 'update'})`}
        />

        {linesAbove > 0 && <Text color={colors.dim}> ▴ {linesAbove} lines above</Text>}

        <Box flexDirection="column">
          {slice.map((line, i) => (
            <Text key={scrollOffset + i}>{line || ' '}</Text>
          ))}
        </Box>

        {linesBelow > 0 && <Text color={colors.dim}> ▾ {linesBelow} lines below</Text>}

        {error && (
          <Box marginTop={1}>
            <Text color={colors.error}>{error}</Text>
          </Box>
        )}

        <HelpBar bindings={helpBindings} />
      </Box>
    );
  }

  // ─── Result Step ───────────────────────────────────────────

  if (busy) {
    return (
      <Box marginTop={1}>
        <Spinner label="Writing files..." />
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Divider label="Generate" rightLabel="done" />

      {writeResult ? (
        <Box marginTop={1} flexDirection="column">
          {writeResult.files.map((f) => (
            <Box key={f.fileName}>
              <Text color={colors.success}>{symbols.healthy} </Text>
              <Text color={colors.text}>
                {f.isNew ? 'Created' : 'Updated'} {f.fileName}
              </Text>
            </Box>
          ))}
          {writeResult.symlink && (
            <Box>
              <Text color={colors.success}>{symbols.healthy} </Text>
              <Text color={colors.text}>Symlink: {writeResult.symlink}</Text>
            </Box>
          )}
        </Box>
      ) : (
        <Box marginTop={1}>
          <Text color={colors.error}>{error || 'No result'}</Text>
        </Box>
      )}

      <HelpBar bindings={[{ key: 'Esc/Enter', action: 'dashboard' }]} />
    </Box>
  );
}
