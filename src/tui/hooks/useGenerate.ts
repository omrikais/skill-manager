import { useState, useCallback } from 'react';
import fs from 'fs-extra';
import path from 'path';
import { resolveProjectRoot } from '../../fs/paths.js';
import {
  collectProjectFacts,
  inferProjectMeta,
  buildAllSections,
  renderSections,
  mergeContent,
  loadGenerateConfig,
  type GenerateTarget,
  type GenerateMode,
  type SymlinkMode,
  type GeneratedSection,
  type MergeResult,
  type ProjectMeta,
  type SectionBuildOptions,
} from '../../core/generate/index.js';

export interface GenerateState {
  target: GenerateTarget | 'both';
  mode: GenerateMode;
  includeSkills: boolean;
  withMcp: boolean;
  symlink: SymlinkMode;
}

export interface GeneratePreview {
  sections: GeneratedSection[];
  meta: ProjectMeta;
  targets: Array<{
    target: GenerateTarget;
    fileName: string;
    content: string;
    mergeResult: MergeResult;
    isNew: boolean;
  }>;
}

export interface GenerateWriteResult {
  files: Array<{ fileName: string; isNew: boolean }>;
  symlink?: string;
}

export function useGenerate() {
  const [state, setState] = useState<GenerateState>({
    target: 'claude-md',
    mode: 'inline',
    includeSkills: false,
    withMcp: false,
    symlink: 'none',
  });

  const [preview, setPreview] = useState<GeneratePreview | null>(null);
  const [writeResult, setWriteResult] = useState<GenerateWriteResult | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const updateState = useCallback(<K extends keyof GenerateState>(key: K, value: GenerateState[K]) => {
    setState((s) => ({ ...s, [key]: value }));
  }, []);

  const generatePreview = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const projectRoot = resolveProjectRoot(process.cwd());
      const facts = await collectProjectFacts(projectRoot);
      const config = await loadGenerateConfig(projectRoot);
      const meta = inferProjectMeta(facts, config);

      const buildOpts: SectionBuildOptions = {
        includeSkills: state.includeSkills,
        withMcp: state.withMcp,
      };

      if (state.includeSkills) {
        const { listSkills } = await import('../../core/skill.js');
        const skills = await listSkills();
        buildOpts.skills = skills.map((s) => ({
          slug: s.slug,
          name: s.name,
          description: s.description,
          triggers: (s.content.frontmatter as Record<string, unknown>).triggers as
            | { files?: string[]; dirs?: string[] }
            | undefined,
        }));
      }

      const targets: GenerateTarget[] = state.target === 'both'
        ? ['claude-md', 'agents-md']
        : [state.target];

      const previewTargets: GeneratePreview['targets'] = [];

      for (const target of targets) {
        const sections = buildAllSections(meta, target, state.mode, buildOpts);
        const fileName = target === 'claude-md' ? 'CLAUDE.md' : 'AGENTS.md';
        const existing = target === 'claude-md' ? facts.existingClaudeMd : facts.existingAgentsMd;

        let mergeResult: MergeResult;
        if (existing) {
          mergeResult = mergeContent(existing, sections);
        } else {
          const content = renderSections(sections);
          mergeResult = {
            content,
            sectionsUpdated: [],
            sectionsPreserved: [],
            sectionsAppended: sections.map((s) => s.name),
            userContentPreserved: false,
          };
        }

        previewTargets.push({
          target,
          fileName,
          content: mergeResult.content,
          mergeResult,
          isNew: existing === null,
        });
      }

      // Use sections from first target for display
      const firstSections = buildAllSections(meta, targets[0], state.mode, buildOpts);

      setPreview({ sections: firstSections, meta, targets: previewTargets });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [state]);

  const writeFiles = useCallback(async () => {
    if (!preview) return;
    setBusy(true);
    setError('');
    try {
      const projectRoot = resolveProjectRoot(process.cwd());
      const files: GenerateWriteResult['files'] = [];

      for (const t of preview.targets) {
        const filePath = path.join(projectRoot, t.fileName);

        // Skip if it will be symlinked away (only for 'both' target)
        const isSymlinkSource = state.target === 'both' && (
          (state.symlink === 'claude-to-agents' && t.target === 'claude-md') ||
          (state.symlink === 'agents-to-claude' && t.target === 'agents-md')
        );

        if (!isSymlinkSource) {
          // Remove stale symlink so we write a regular file, not through the link
          try {
            const stat = await fs.lstat(filePath);
            if (stat.isSymbolicLink()) {
              await fs.remove(filePath);
            }
          } catch { /* doesn't exist yet */ }
          await fs.writeFile(filePath, t.content, 'utf-8');
          files.push({ fileName: t.fileName, isNew: t.isNew });
        }
      }

      // Handle symlink
      let symlinkMsg: string | undefined;
      if (state.target === 'both' && state.symlink !== 'none') {
        const claudeMd = path.join(projectRoot, 'CLAUDE.md');
        const agentsMd = path.join(projectRoot, 'AGENTS.md');

        if (state.symlink === 'claude-to-agents') {
          try { await fs.remove(claudeMd); } catch { /* ok */ }
          try {
            await fs.symlink('AGENTS.md', claudeMd);
          } catch (symlinkErr) {
            if (process.platform === 'win32' &&
              ((symlinkErr as NodeJS.ErrnoException)?.code === 'EPERM' ||
               (symlinkErr as NodeJS.ErrnoException)?.code === 'ENOTSUP')) {
              throw new Error(
                'Symlinks require Developer Mode or admin on Windows. ' +
                'Enable: Settings → Update & Security → For Developers → Developer Mode'
              );
            }
            throw symlinkErr;
          }
          symlinkMsg = 'CLAUDE.md → AGENTS.md';
        } else {
          try { await fs.remove(agentsMd); } catch { /* ok */ }
          try {
            await fs.symlink('CLAUDE.md', agentsMd);
          } catch (symlinkErr) {
            if (process.platform === 'win32' &&
              ((symlinkErr as NodeJS.ErrnoException)?.code === 'EPERM' ||
               (symlinkErr as NodeJS.ErrnoException)?.code === 'ENOTSUP')) {
              throw new Error(
                'Symlinks require Developer Mode or admin on Windows. ' +
                'Enable: Settings → Update & Security → For Developers → Developer Mode'
              );
            }
            throw symlinkErr;
          }
          symlinkMsg = 'AGENTS.md → CLAUDE.md';
        }
      }

      setWriteResult({ files, symlink: symlinkMsg });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [preview, state]);

  return {
    state,
    updateState,
    preview,
    writeResult,
    error,
    busy,
    generatePreview,
    writeFiles,
  };
}
