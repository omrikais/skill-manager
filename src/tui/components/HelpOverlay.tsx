import React from 'react';
import { Box, Text, useInput } from 'ink';
import { screenHelp, globalHelp } from '../helpData.js';
import { colors } from '../theme.js';
import type { ScreenName } from '../theme.js';

const screenDisplayNames: Record<ScreenName, string> = {
  dashboard: 'Dashboard',
  browser: 'Browser',
  detail: 'Detail',
  import: 'Import',
  profiles: 'Profiles',
  sync: 'Sync',
  sources: 'Sources',
  generate: 'Generate',
};

interface HelpOverlayProps {
  screen: ScreenName;
  onClose: () => void;
  /** When set, only show the matching category (plus Global). */
  activeCategory?: string;
}

export function HelpOverlay({ screen, onClose, activeCategory }: HelpOverlayProps) {
  useInput((input, key) => {
    if (input === '?' || key.escape) {
      onClose();
    }
  });

  const screenGroups = activeCategory
    ? screenHelp[screen].filter((g) => g.category === activeCategory)
    : screenHelp[screen];
  const groups = [...screenGroups, globalHelp];

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={colors.primary}
      paddingX={2}
      paddingY={1}
      marginTop={1}
    >
      <Text color={colors.accent} bold>
        Key Reference {'\u2014'} {screenDisplayNames[screen]}
      </Text>

      {groups.map((group, gi) => (
        <Box key={gi} flexDirection="column" marginTop={1}>
          <Text color={colors.text} bold>
            {group.category}
          </Text>
          {group.bindings.map((b, bi) => (
            <Box key={bi} gap={1}>
              <Text color={colors.accent}>{`  ${b.key.padEnd(12)}`}</Text>
              <Text color={colors.muted}>{b.action}</Text>
            </Box>
          ))}
        </Box>
      ))}

      <Box marginTop={1}>
        <Text color={colors.dim}>
          Press <Text color={colors.accent}>?</Text> or <Text color={colors.accent}>Esc</Text> to close
        </Text>
      </Box>
    </Box>
  );
}
