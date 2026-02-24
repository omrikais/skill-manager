export * from './types.js';
export { collectProjectFacts } from './collector.js';
export { inferProjectMeta } from './heuristics.js';
export { buildSection, buildAllSections } from './sections.js';
export { renderDocument, renderSections } from './renderer.js';
export { mergeContent, detectDrift, hasManagedBlocks } from './merge.js';
export { loadGenerateConfig } from './config.js';
