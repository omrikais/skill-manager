import React from 'react';
import { Box, Text } from 'ink';
import { colors } from '../theme.js';

interface TerminalSizeWarningProps {
  screenName: string;
  width: number;
  height: number;
  minWidth: number;
  minHeight: number;
}

export function TerminalSizeWarning({ screenName, width, height, minWidth, minHeight }: TerminalSizeWarningProps) {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color={colors.warning}>
        Terminal too small for {screenName}. Current: {width}x{height}, required: {'>'}={minWidth}x{minHeight}.
      </Text>
      <Text color={colors.muted}>Resize terminal and retry.</Text>
    </Box>
  );
}
