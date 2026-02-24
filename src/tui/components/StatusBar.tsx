import React from 'react';
import { Box, Text } from 'ink';
import { colors, symbols } from '../theme.js';

interface StatusBarProps {
  screenName: string;
  totalSkills: number;
  userCount: number;
  projectCount: number;
  rightLabel?: string;
}

export function StatusBar({ screenName, totalSkills, userCount, projectCount, rightLabel }: StatusBarProps) {
  return (
    <Box justifyContent="space-between">
      <Box>
        <Text color={colors.primary} bold>
          sm
        </Text>
        <Text color={colors.muted}> {symbols.arrow} </Text>
        <Text color={colors.primary} bold>
          {screenName}
        </Text>
      </Box>
      <Box gap={1}>
        {rightLabel && <Text color={colors.dim}>{rightLabel}</Text>}
        {!rightLabel && (
          <>
            <Text color={colors.muted}>{totalSkills} skills</Text>
            <Text color={colors.dim}>{symbols.dot}</Text>
            <Text color={colors.muted}>{userCount} user</Text>
            <Text color={colors.dim}>{symbols.dot}</Text>
            <Text color={colors.muted}>{projectCount} project</Text>
          </>
        )}
      </Box>
    </Box>
  );
}
