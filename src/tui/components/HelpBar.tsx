import React from 'react';
import { Box, Text } from 'ink';
import { colors } from '../theme.js';

interface KeyBinding {
  key: string;
  action: string;
}

interface HelpBarProps {
  bindings: KeyBinding[];
}

export function HelpBar({ bindings }: HelpBarProps) {
  return (
    <Box marginTop={1} gap={2}>
      {bindings.map((b, i) => (
        <Box key={i}>
          <Text color={colors.dim}>{b.key}</Text>
          <Text color={colors.muted}>{` ${b.action}`}</Text>
        </Box>
      ))}
    </Box>
  );
}
