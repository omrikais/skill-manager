import React from 'react';
import { Box, Text } from 'ink';
import { HelpBar } from './HelpBar.js';
import { colors } from '../theme.js';

export interface ConfirmDialogProps {
  title: string;
  message?: string;
  warning?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  /** Override the default y/n/Esc bindings shown in the help bar. */
  bindings?: { key: string; action: string }[];
}

export function ConfirmDialog({
  title,
  message,
  warning,
  confirmLabel = 'confirm',
  cancelLabel = 'cancel',
  danger = false,
  bindings,
}: ConfirmDialogProps) {
  const titleColor = danger ? colors.error : colors.warning;

  const defaultBindings = [
    { key: 'y', action: confirmLabel },
    { key: 'n', action: cancelLabel },
    { key: 'Esc', action: 'cancel' },
  ];

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color={titleColor} bold>
        {title}
      </Text>
      {message && (
        <Box marginTop={1}>
          <Text color={colors.text}>{message}</Text>
        </Box>
      )}
      {warning && (
        <Box marginTop={1}>
          <Text color={colors.warning}>! {warning}</Text>
        </Box>
      )}
      <HelpBar bindings={bindings ?? defaultBindings} />
    </Box>
  );
}
