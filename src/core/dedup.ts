import { hashContent } from './hash.js';

export interface ScannedFile {
  path: string;
  source: string; // 'cc-commands' | 'codex-prompts' | 'codex-skills' | 'agents-skills'
  slug: string;
  content: string;
  hash: string;
}

export interface DedupGroup {
  hash: string;
  slug: string;
  files: ScannedFile[];
  canonical: ScannedFile; // The one we'll keep as source
}

export function deduplicateFiles(files: ScannedFile[]): DedupGroup[] {
  // Group by hash
  const byHash = new Map<string, ScannedFile[]>();
  for (const f of files) {
    const group = byHash.get(f.hash) || [];
    group.push(f);
    byHash.set(f.hash, group);
  }

  // Group by slug (for same-name, different-content files)
  const bySlug = new Map<string, DedupGroup>();

  for (const [hash, group] of byHash) {
    // Use slug from first file
    const slug = group[0].slug;

    if (bySlug.has(slug)) {
      // Same slug, different hash — possible conflict
      // Append hash suffix to disambiguate
      const existing = bySlug.get(slug)!;
      if (existing.hash !== hash) {
        const altSlug = `${slug}-${hash.slice(0, 8)}`;
        bySlug.set(altSlug, {
          hash,
          slug: altSlug,
          files: group,
          canonical: pickCanonical(group),
        });
        continue;
      }
    }

    bySlug.set(slug, {
      hash,
      slug,
      files: group,
      canonical: pickCanonical(group),
    });
  }

  return Array.from(bySlug.values());
}

function pickCanonical(files: ScannedFile[]): ScannedFile {
  // Prefer skill format > codex-skills > agents-skills > cc-commands > codex-prompts
  const priority: Record<string, number> = {
    'codex-skills': 0,
    'agents-skills': 1,
    'cc-commands': 2,
    'codex-prompts': 3,
  };

  return files.sort((a, b) => (priority[a.source] ?? 99) - (priority[b.source] ?? 99))[0];
}

export function buildScannedFile(
  filePath: string,
  source: string,
  slug: string,
  content: string
): ScannedFile {
  return {
    path: filePath,
    source,
    slug,
    content,
    hash: hashContent(content),
  };
}
