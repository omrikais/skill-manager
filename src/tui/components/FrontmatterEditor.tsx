import React from 'react';
import { Box, Text } from 'ink';
import { TextInput } from '@inkjs/ui';
import { HelpBar } from './HelpBar.js';
import { colors, symbols } from '../theme.js';

const FIELD_KEYS = ['name', 'description', 'tags'] as const;
type FieldKey = (typeof FIELD_KEYS)[number];

const FIELD_LABELS: Record<FieldKey, string> = {
  name: 'Name',
  description: 'Description',
  tags: 'Tags',
};

export interface FrontmatterEditorProps {
  fields: { name: string; description: string; tags: string };
  fieldIndex: number;
  editingField: boolean;
  onFieldChange: (field: FieldKey, value: string) => void;
  onFieldSubmit: () => void;
}

export function FrontmatterEditor({
  fields,
  fieldIndex,
  editingField,
  onFieldChange,
  onFieldSubmit,
}: FrontmatterEditorProps) {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color={colors.text} bold>Edit Frontmatter</Text>
      <Box flexDirection="column" marginTop={1}>
        {FIELD_KEYS.map((key, i) => {
          const selected = i === fieldIndex;
          const active = selected && editingField;
          const indicator = selected ? `${symbols.selected} ` : '  ';
          const labelColor = selected ? colors.primary : colors.muted;

          return (
            <Box key={key} gap={1}>
              <Text color={labelColor}>{indicator}{FIELD_LABELS[key].padEnd(12)}</Text>
              {active ? (
                <TextInput
                  defaultValue={fields[key]}
                  onChange={(v) => onFieldChange(key, v)}
                  onSubmit={onFieldSubmit}
                />
              ) : (
                <Text color={selected ? colors.text : colors.dim}>
                  {fields[key] || '(empty)'}
                </Text>
              )}
            </Box>
          );
        })}
      </Box>
      {fieldIndex === 2 && !editingField && (
        <Box marginTop={1}>
          <Text color={colors.dim}>Comma-separated list of tags</Text>
        </Box>
      )}
      <HelpBar
        bindings={editingField
          ? [
            { key: 'Enter', action: 'confirm' },
            { key: 'Esc', action: 'cancel field' },
          ]
          : [
            { key: 'j/k', action: 'navigate' },
            { key: 'Enter', action: 'edit field' },
            { key: 's', action: 'save' },
            { key: 'Esc', action: 'discard' },
          ]
        }
      />
    </Box>
  );
}
