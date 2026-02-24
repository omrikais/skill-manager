import React from 'react';
import { Box, Text } from 'ink';
import type { DiffHunk } from '../utils/diff.js';
import { Divider } from './Divider.js';
import { HelpBar } from './HelpBar.js';
import { colors } from '../theme.js';

interface DiffViewProps {
  skillName: string;
  hunks: DiffHunk[];
  scrollOffset: number;
  maxHeight: number;
}

export function DiffView({ skillName, hunks, scrollOffset, maxHeight }: DiffViewProps) {
  // Flatten hunks into renderable lines
  const allLines: { text: string; color: string }[] = [];

  for (const hunk of hunks) {
    allLines.push({
      text: `@@ -${hunk.oldStart} +${hunk.newStart} @@`,
      color: colors.muted,
    });
    for (const line of hunk.lines) {
      if (line.type === 'add') {
        allLines.push({ text: `+ ${line.content}`, color: colors.success });
      } else if (line.type === 'remove') {
        allLines.push({ text: `- ${line.content}`, color: colors.error });
      } else {
        allLines.push({ text: `  ${line.content}`, color: colors.dim });
      }
    }
  }

  const totalLines = allLines.length;
  const slice = allLines.slice(scrollOffset, scrollOffset + maxHeight);
  const linesAbove = scrollOffset;
  const linesBelow = Math.max(0, totalLines - scrollOffset - maxHeight);

  return (
    <Box flexDirection="column">
      <Divider label={skillName} rightLabel="Local \u2192 Remote" />

      {linesAbove > 0 && (
        <Text color={colors.dim}>  \u25B4 {linesAbove} lines above</Text>
      )}

      <Box flexDirection="column">
        {slice.map((line, i) => (
          <Text key={scrollOffset + i} color={line.color}>
            {line.text || ' '}
          </Text>
        ))}
      </Box>

      {linesBelow > 0 && (
        <Text color={colors.dim}>  \u25BE {linesBelow} lines below</Text>
      )}

      <HelpBar bindings={[
        { key: 'j/k', action: 'scroll' },
        { key: 'y', action: 'accept update' },
        { key: 'Esc', action: 'back' },
      ]} />
    </Box>
  );
}
