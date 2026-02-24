import type {
  ProjectMeta,
  GenerateTarget,
  GenerateMode,
  SectionBuildOptions,
  SectionName,
  GeneratedSection,
} from './types.js';
import { buildAllSections } from './sections.js';

const BLOCK_BEGIN = (name: string) => `<!-- sm:begin ${name} -->`;
const BLOCK_END = (name: string) => `<!-- sm:end ${name} -->`;

/**
 * Render a full document from inferred metadata.
 * Each section is wrapped in managed block markers.
 */
export function renderDocument(
  meta: ProjectMeta,
  target: GenerateTarget,
  mode: GenerateMode,
  opts: SectionBuildOptions,
  sectionFilter?: SectionName,
): string {
  const sections = buildAllSections(meta, target, mode, opts, sectionFilter);
  return renderSections(sections);
}

/**
 * Render pre-built sections into a full document with managed block markers.
 */
export function renderSections(sections: GeneratedSection[]): string {
  const parts: string[] = [];

  for (const section of sections) {
    parts.push(BLOCK_BEGIN(section.name));
    parts.push(section.content);
    parts.push(BLOCK_END(section.name));
  }

  return parts.join('\n') + '\n';
}

export { BLOCK_BEGIN, BLOCK_END };
