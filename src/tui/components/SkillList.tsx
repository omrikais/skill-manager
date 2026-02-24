import React from 'react';
import { Box, Text } from 'ink';
import type { Skill } from '../../core/skill.js';
import type { LinkRecord } from '../../core/state.js';
import { colors } from '../theme.js';

const DEFAULT_NAME_WIDTH = 38;

// Column layout constants (spacing between deployment indicators)
const COL_GAP = 2; // gap after name, before first column
const DOT_GAP = 3; // gap between CC and Codex dots within a scope
const SCOPE_GAP = 7; // gap between User Codex dot and Project CC dot

interface SkillListProps {
  skills: Skill[];
  links: LinkRecord[];
  selectedIndex: number;
  maxHeight?: number;
  projectRoot?: string;
  showDescription?: boolean;
  descriptionLength?: number;
  selectedSlugs?: Set<string>;
  nameWidth?: number;
}

export function SkillList({
  skills,
  links,
  selectedIndex,
  maxHeight = 20,
  projectRoot,
  showDescription = true,
  descriptionLength = 24,
  selectedSlugs,
  nameWidth = DEFAULT_NAME_WIDTH,
}: SkillListProps) {
  const multiSelect = selectedSlugs != null;
  const prefixWidth = (multiSelect ? 2 : 0) + 2; // checkbox + pointer

  // Compute visible window
  const start = Math.max(0, Math.min(selectedIndex - Math.floor(maxHeight / 2), skills.length - maxHeight));
  const visibleSkills = skills.slice(Math.max(0, start), Math.max(0, start) + maxHeight);
  const startIdx = Math.max(0, start);

  return (
    <Box flexDirection="column">
      {/* Column headers — scope and tool labels aligned to data dots */}
      <Box flexDirection="column">
        <Box>
          <Text>{' '.repeat(prefixWidth + nameWidth + COL_GAP)}</Text>
          <Text color={colors.text} bold>
            {'USER'.padEnd(1 + DOT_GAP + 1 + SCOPE_GAP)}
          </Text>
          <Text color={colors.accent} bold>
            {'PROJECT'}
          </Text>
        </Box>
        <Box>
          <Text>{' '.repeat(prefixWidth + nameWidth + COL_GAP)}</Text>
          <Text color={colors.cc}>{'CC'.padEnd(1 + DOT_GAP)}</Text>
          <Text color={colors.codex}>{'Codex'.padEnd(1 + SCOPE_GAP)}</Text>
          <Text color={colors.cc}>{'CC'.padEnd(1 + DOT_GAP)}</Text>
          <Text color={colors.codex}>{'Codex'}</Text>
        </Box>
      </Box>

      {visibleSkills.map((skill, i) => {
        const idx = startIdx + i;
        const isSelected = idx === selectedIndex;
        const skillLinks = links.filter((l) => l.slug === skill.slug);

        const userCC = skillLinks.some((l) => l.tool === 'cc' && (l.scope ?? 'user') === 'user');
        const userCodex = skillLinks.some((l) => l.tool === 'codex' && (l.scope ?? 'user') === 'user');
        const projectCC =
          projectRoot != null &&
          skillLinks.some((l) => l.tool === 'cc' && l.scope === 'project' && l.projectRoot === projectRoot);
        const projectCodex =
          projectRoot != null &&
          skillLinks.some((l) => l.tool === 'codex' && l.scope === 'project' && l.projectRoot === projectRoot);

        const checked = multiSelect && selectedSlugs.has(skill.slug);

        return (
          <Box key={skill.slug} flexDirection="column">
            <Box>
              {multiSelect && (
                <Text color={checked ? colors.primary : colors.dim}>{checked ? '\u25FC ' : '\u25FB '}</Text>
              )}
              <Text color={isSelected ? colors.primary : colors.muted} bold={isSelected}>
                {isSelected ? '\u25B8 ' : '  '}
              </Text>
              <Text color={isSelected ? colors.primary : colors.text} bold={isSelected}>
                {truncate(skill.slug, nameWidth).padEnd(nameWidth)}
              </Text>
              <Text>{' '.repeat(COL_GAP)}</Text>
              <Text color={userCC ? colors.cc : colors.muted}>{userCC ? '\u25CF' : '\u25CB'}</Text>
              <Text>{' '.repeat(DOT_GAP)}</Text>
              <Text color={userCodex ? colors.codex : colors.muted}>{userCodex ? '\u25CF' : '\u25CB'}</Text>
              <Text>{' '.repeat(SCOPE_GAP)}</Text>
              <Text color={projectCC ? colors.cc : colors.muted}>{projectCC ? '\u25CF' : '\u25CB'}</Text>
              <Text>{' '.repeat(DOT_GAP)}</Text>
              <Text color={projectCodex ? colors.codex : colors.muted}>{projectCodex ? '\u25CF' : '\u25CB'}</Text>
            </Box>
            {showDescription && (
              <Box>
                <Text color={colors.muted}>{' '.repeat(prefixWidth + 1)}</Text>
                <Text color={colors.dim}>{truncate(skill.description, descriptionLength)}</Text>
              </Box>
            )}
          </Box>
        );
      })}
      {skills.length > maxHeight && <Text color={colors.dim}>{`  (${selectedIndex + 1}/${skills.length})`}</Text>}
    </Box>
  );
}

function truncate(str: string, len: number): string {
  if (str.length <= len) return str;
  return str.slice(0, len - 1) + '\u2026';
}
