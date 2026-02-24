import type { GeneratedSection, MergeResult, SectionName } from './types.js';
import { BLOCK_BEGIN, BLOCK_END } from './renderer.js';

const BEGIN_RE = /^<!-- sm:begin (\S+) -->\r?$/;
const END_RE = /^<!-- sm:end (\S+) -->\r?$/;

interface ParsedBlock {
  name: string;
  content: string;
  startLine: number;
  endLine: number;
}

/**
 * Parse existing content to find managed blocks.
 */
function parseManagedBlocks(content: string): ParsedBlock[] {
  const lines = content.split('\n');
  const blocks: ParsedBlock[] = [];
  let currentName: string | null = null;
  let startLine = -1;
  const contentLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const beginMatch = lines[i].match(BEGIN_RE);
    const endMatch = lines[i].match(END_RE);

    if (beginMatch && !currentName) {
      currentName = beginMatch[1];
      startLine = i;
      contentLines.length = 0;
    } else if (endMatch && currentName && endMatch[1] === currentName) {
      blocks.push({
        name: currentName,
        content: contentLines.join('\n'),
        startLine,
        endLine: i,
      });
      currentName = null;
    } else if (currentName) {
      contentLines.push(lines[i]);
    }
  }

  return blocks;
}

/**
 * Merge generated sections into existing content.
 *
 * - Existing managed blocks are replaced with updated content
 * - New sections are appended at the end
 * - Content outside managed blocks is never touched
 */
export function mergeContent(
  existing: string,
  sections: GeneratedSection[],
  sectionFilter?: SectionName,
): MergeResult {
  const filteredSections = sectionFilter
    ? sections.filter((s) => s.name === sectionFilter)
    : sections;

  const blocks = parseManagedBlocks(existing);
  const existingBlockNames = new Set(blocks.map((b) => b.name));
  // Track start lines of properly closed blocks to avoid replacing unclosed duplicates
  const closedBlockStarts = new Set(blocks.map((b) => b.startLine));

  const sectionsUpdated: string[] = [];
  const sectionsPreserved: string[] = [];
  const sectionsAppended: string[] = [];

  // Build the result line by line
  const lines = existing.split('\n');
  const result: string[] = [];
  let skip = false;
  let skipEndName: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const beginMatch = lines[i].match(BEGIN_RE);
    const endMatch = lines[i].match(END_RE);

    if (skip) {
      // Inside a block being replaced — only look for the closing marker
      if (endMatch && endMatch[1] === skipEndName) {
        result.push(BLOCK_END(skipEndName));
        skip = false;
        skipEndName = null;
      }
    } else if (beginMatch) {
      const blockName = beginMatch[1];
      const newSection = filteredSections.find((s) => s.name === blockName);

      if (newSection && closedBlockStarts.has(i)) {
        // Replace this block (confirmed closed by parseManagedBlocks)
        result.push(BLOCK_BEGIN(blockName));
        result.push(newSection.content);
        sectionsUpdated.push(blockName);
        skip = true;
        skipEndName = blockName;
      } else {
        // Preserve this block (not in our filter)
        result.push(lines[i]);
        sectionsPreserved.push(blockName);
      }
    } else {
      result.push(lines[i]);
    }
  }

  // Append new sections that don't have existing blocks
  for (const section of filteredSections) {
    if (!existingBlockNames.has(section.name)) {
      // Add blank line before new block if content doesn't end with one
      const lastLine = result[result.length - 1];
      if (lastLine !== undefined && lastLine.trim() !== '') {
        result.push('');
      }
      result.push(BLOCK_BEGIN(section.name));
      result.push(section.content);
      result.push(BLOCK_END(section.name));
      sectionsAppended.push(section.name);
    }
  }

  const content = result.join('\n');
  const userContentPreserved = sectionsUpdated.length > 0 || sectionsPreserved.length > 0;

  return {
    content,
    sectionsUpdated,
    sectionsPreserved,
    sectionsAppended,
    userContentPreserved,
  };
}

/**
 * Detect drift: sections where existing managed block content differs from generated.
 */
export function detectDrift(
  existing: string,
  sections: GeneratedSection[],
): Array<{ name: string; existingContent: string; generatedContent: string }> {
  const blocks = parseManagedBlocks(existing);
  const drift: Array<{ name: string; existingContent: string; generatedContent: string }> = [];

  for (const section of sections) {
    const block = blocks.find((b) => b.name === section.name);
    if (block && block.content !== section.content) {
      drift.push({
        name: section.name,
        existingContent: block.content,
        generatedContent: section.content,
      });
    }
  }

  return drift;
}

/**
 * Check if content has any managed blocks.
 */
export function hasManagedBlocks(content: string): boolean {
  return parseManagedBlocks(content).length > 0;
}
