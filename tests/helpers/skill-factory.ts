import fs from 'fs-extra';

/**
 * Shared test helper: creates a skill directory in the tmpdir-based SM_HOME.
 *
 * MUST be called *after* `vi.resetModules()` so that dynamic `import()` of
 * `src/fs/paths.js` picks up the env-var override set by `createTmpSmHome()`.
 */
export async function createTestSkill(
  slug: string,
  frontmatter: Record<string, unknown>,
  metaOverrides?: {
    deployAs?: { cc?: string; codex?: string };
    lastUsed?: string;
    usageCount?: number;
    lastDeployed?: string;
  },
): Promise<void> {
  const { skillDir, skillFile, skillMetaFile } = await import(
    '../../src/fs/paths.js'
  );
  await fs.ensureDir(skillDir(slug));

  let yaml = '---\n';
  for (const [key, value] of Object.entries(frontmatter)) {
    if (key === 'triggers') {
      yaml += 'triggers:\n';
      const triggers = value as Record<string, string[]>;
      if (triggers.files) {
        yaml += '  files:\n';
        for (const f of triggers.files) {
          yaml += `    - "${f}"\n`;
        }
      }
      if (triggers.dirs) {
        yaml += '  dirs:\n';
        for (const d of triggers.dirs) {
          yaml += `    - "${d}"\n`;
        }
      }
    } else if (Array.isArray(value)) {
      yaml += `${key}: [${value.map((v) => `"${v}"`).join(', ')}]\n`;
    } else {
      yaml += `${key}: "${value}"\n`;
    }
  }
  yaml += '---\n\n# ' + slug;
  await fs.writeFile(skillFile(slug), yaml, 'utf-8');

  await fs.writeJson(skillMetaFile(slug), {
    format: 'skill',
    source: { type: 'created' },
    tags: (frontmatter.tags as string[]) ?? [],
    deployAs: {
      cc: metaOverrides?.deployAs?.cc ?? 'skill',
      codex: metaOverrides?.deployAs?.codex ?? 'skill',
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastUsed: metaOverrides?.lastUsed,
    usageCount: metaOverrides?.usageCount ?? 0,
    lastDeployed: metaOverrides?.lastDeployed,
  });
}
