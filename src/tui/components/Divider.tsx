import React, { useContext } from 'react';
import { Box, Text } from 'ink';
import { ScreenSizeContext } from '../App.js';
import { colors } from '../theme.js';
import { truncate } from '../utils/truncate.js';

interface DividerProps {
  label?: string;
  rightLabel?: string;
}

export function Divider({ label, rightLabel }: DividerProps) {
  const { width } = useContext(ScreenSizeContext);
  const line = '\u2500'; // ─

  if (!label) {
    return (
      <Box marginTop={1}>
        <Text color={colors.dim}>{line.repeat(Math.max(1, width - 2))}</Text>
      </Box>
    );
  }

  // Layout: "{leftPad} {leftLabel} {fill}{rightText}"
  // leftPad = 2 line chars, spaces add 2, margin = 2, minFill = 2
  const minChrome = 8; // leftPad(2) + space(1) + space(1) + minFill(2) + margin(2)

  // 1. Truncate right label first
  let displayRight = rightLabel ?? '';
  let displayLeft = label;

  // Available space for right label = width - minChrome - leftLabel.length - 1 (leading space before right)
  if (displayRight) {
    const maxRight = Math.max(0, width - minChrome - displayLeft.length - 1);
    displayRight = truncate(displayRight, maxRight);
  }

  // 2. If still too wide, truncate left label
  const rightPart = displayRight ? ` ${displayRight}` : '';
  const maxLeft = Math.max(0, width - minChrome - rightPart.length);
  displayLeft = truncate(displayLeft, maxLeft);

  // 3. Compute fill to exactly fit width
  const leftPad = line.repeat(2);
  const rightText = displayRight ? ` ${displayRight}` : '';
  // Total fixed chars: leftPad(2) + space(1) + displayLeft + space(1) + rightText + margin(2)
  const usedWidth = 2 + 1 + displayLeft.length + 1 + rightText.length + 2;
  const fillLen = Math.max(2, width - usedWidth);

  return (
    <Box marginTop={1}>
      <Text color={colors.dim}>
        {leftPad} {displayLeft} {line.repeat(fillLen)}
        {rightText}
      </Text>
    </Box>
  );
}
