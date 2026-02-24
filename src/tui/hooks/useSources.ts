import { useState, useEffect, useCallback, useRef } from 'react';
import fs from 'fs-extra';
import {
  loadSourcesRegistry,
  addSourceEntry,
  removeSourceEntry,
  getSourceEntry,
  updateSourceEntry,
  deriveSourceName,
  validateSourceUrl,
  normalizeSourceUrl,
  resetSourcesCache,
  type SourceEntry,
} from '../../core/sources.js';
import { cloneOrPull, cloneOrPullWithStatus } from '../../sources/git.js';
import { scanSourceRepo, type RemoteSkill } from '../../sources/scanner.js';
import { sourceRepoDir } from '../../fs/paths.js';
import {
  importSingleSkill,
  deploySingleSkill,
  checkSkillConflict,
  type ConflictStatus,
} from '../../commands/_import-helpers.js';
import { resolveInstallInput } from '../../core/install-resolver.js';
import { skillFile } from '../../fs/paths.js';

export interface SourceWithSkills {
  entry: SourceEntry;
  skills: RemoteSkill[];
}

export function useSources() {
  const [sources, setSources] = useState<SourceWithSkills[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      resetSourcesCache();
      const registry = await loadSourcesRegistry();
      const result: SourceWithSkills[] = [];

      for (const entry of registry.sources) {
        const dir = sourceRepoDir(entry.name);
        if (await fs.pathExists(dir)) {
          const skills = await scanSourceRepo(dir, entry.name, entry.url);
          result.push({ entry, skills });
        } else {
          result.push({ entry, skills: [] });
        }
      }

      if (!mountedRef.current) return;
      setSources(result);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addSource = useCallback(
    async (url: string): Promise<{ ok: boolean; message: string }> => {
      try {
        validateSourceUrl(url);
        const name = deriveSourceName(url);

        // If a source with this name already exists, sync instead of overwriting
        const existing = await getSourceEntry(name);
        if (existing) {
          if (normalizeSourceUrl(existing.url) !== normalizeSourceUrl(url)) {
            return {
              ok: false,
              message: `Source "${name}" already exists with a different URL. Remove it first to add a new one.`,
            };
          }
          // Use stored URL to avoid SSH↔HTTPS mismatch in git layer
          const dir = await cloneOrPull(existing.url);
          const skills = await scanSourceRepo(dir, name, existing.url);
          await updateSourceEntry(name, {
            lastSync: new Date().toISOString(),
            skillCount: skills.length,
            lastError: undefined,
          });
          await refresh();
          return { ok: true, message: `Source "${name}" already exists. Synced: ${skills.length} skills` };
        }

        const { dir } = await cloneOrPullWithStatus(url);
        const skills = await scanSourceRepo(dir, name, url);

        await addSourceEntry({
          name,
          url,
          addedAt: new Date().toISOString(),
          lastSync: new Date().toISOString(),
          skillCount: skills.length,
        });

        await refresh();
        return { ok: true, message: `Added "${name}" with ${skills.length} skills` };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        return { ok: false, message: msg };
      }
    },
    [refresh],
  );

  const syncSource = useCallback(
    async (name: string): Promise<{ ok: boolean; message: string }> => {
      try {
        const entry = sources.find((s) => s.entry.name === name)?.entry;
        if (!entry) return { ok: false, message: `Source "${name}" not found` };

        const dir = await cloneOrPull(entry.url);
        const skills = await scanSourceRepo(dir, entry.name, entry.url);
        await updateSourceEntry(entry.name, {
          lastSync: new Date().toISOString(),
          skillCount: skills.length,
          lastError: undefined,
        });

        await refresh();
        return { ok: true, message: `Synced "${name}": ${skills.length} skills` };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        return { ok: false, message: msg };
      }
    },
    [sources, refresh],
  );

  const removeSource = useCallback(
    async (name: string): Promise<{ ok: boolean; message: string }> => {
      try {
        await removeSourceEntry(name);
        await refresh();
        return { ok: true, message: `Removed "${name}"` };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        return { ok: false, message: msg };
      }
    },
    [refresh],
  );

  const installSkill = useCallback(
    async (skill: RemoteSkill): Promise<{ ok: boolean; message: string }> => {
      try {
        const content = await fs.readFile(skill.filePath, 'utf-8');
        await importSingleSkill({
          slug: skill.slug,
          content,
          source: { type: 'git', repo: skill.sourceUrl, originalPath: skill.filePath },
        });
        await deploySingleSkill(skill.slug, ['cc', 'codex']);
        await refresh();
        return { ok: true, message: `Installed "${skill.slug}"` };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        return { ok: false, message: msg };
      }
    },
    [refresh],
  );

  const checkForUpdate = useCallback(async (skill: RemoteSkill): Promise<ConflictStatus> => {
    const content = await fs.readFile(skill.filePath, 'utf-8');
    return checkSkillConflict(skill.slug, content);
  }, []);

  const quickInstall = useCallback(
    async (rawInput: string): Promise<{ ok: boolean; message: string }> => {
      try {
        const { url, slugs } = resolveInstallInput(rawInput);

        // Add/sync the source — abort on failure to avoid installing stale content
        const addResult = await addSource(url);

        if (!addResult.ok || slugs.length === 0) {
          return addResult;
        }

        // Source was successfully added/synced — proceed to install requested slugs.
        // Use canonical URL from registry so skill metadata stays consistent.
        const name = deriveSourceName(url);
        const entry = await getSourceEntry(name);
        const canonicalUrl = entry?.url ?? url;
        const dir = sourceRepoDir(name);
        const scannedSkills = await scanSourceRepo(dir, name, canonicalUrl);
        const available = new Map(scannedSkills.map((s) => [s.slug, s]));

        // Validate requested slugs
        const missing = slugs.filter((s) => !available.has(s));
        if (missing.length > 0) {
          return {
            ok: false,
            message: `Skills not found in "${name}": ${missing.join(', ')}. Available: ${[...available.keys()].join(', ')}`,
          };
        }

        // Install or update matching skills (explicit slugs imply intent to update)
        let installed = 0;
        let updated = 0;
        const failed: string[] = [];
        for (const slug of slugs) {
          const skill = available.get(slug)!;
          if (skill.installed) {
            const status = await checkForUpdate(skill);
            if (status === 'identical') continue;
            // Changed — auto-update since user explicitly named this slug
          }
          const result = await installSkill(skill);
          if (result.ok) {
            if (skill.installed) updated++;
            else installed++;
          } else {
            failed.push(slug);
          }
        }

        const parts: string[] = [];
        if (installed > 0) parts.push(`${installed} installed`);
        if (updated > 0) parts.push(`${updated} updated`);
        if (failed.length > 0) parts.push(`${failed.length} failed: ${failed.join(', ')}`);
        const message =
          parts.length > 0 ? `${parts.join(', ')} from "${name}"` : `All skills from "${name}" are up to date`;
        return { ok: failed.length === 0, message };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        return { ok: false, message: msg };
      }
    },
    [addSource, installSkill, checkForUpdate],
  );

  const getUpdateContent = useCallback(async (skill: RemoteSkill): Promise<{ local: string; remote: string }> => {
    const remoteContent = await fs.readFile(skill.filePath, 'utf-8');
    const localContent = await fs.readFile(skillFile(skill.slug), 'utf-8');
    return { local: localContent, remote: remoteContent };
  }, []);

  return {
    sources,
    loading,
    error,
    refresh,
    addSource,
    syncSource,
    removeSource,
    installSkill,
    checkForUpdate,
    getUpdateContent,
    quickInstall,
  };
}
