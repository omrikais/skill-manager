import chalk from 'chalk';
import { createEmptyManifest, saveManifest } from '../core/manifest.js';
import { getLinkRecords } from '../core/state.js';
import { projectManifestFile, resolveProjectRoot } from '../fs/paths.js';
import fs from 'fs-extra';

interface InitOptions {
  fromCurrent?: boolean;
}

export async function initCommand(opts: InitOptions): Promise<void> {
  const projectRoot = resolveProjectRoot(process.cwd());
  const manifestPath = projectManifestFile(projectRoot);

  if (await fs.pathExists(manifestPath)) {
    console.log(chalk.yellow(`${manifestPath} already exists.`));
    return;
  }

  const manifest = createEmptyManifest();

  if (opts.fromCurrent) {
    // Populate from currently deployed skills
    const links = await getLinkRecords();
    const seen = new Set<string>();

    for (const link of links) {
      const linkScope = link.scope ?? 'user';

      // Skip project-scoped links from OTHER projects
      if (linkScope === 'project' && link.projectRoot !== projectRoot) continue;

      const key = `${link.slug}:${linkScope}`;
      if (seen.has(key)) {
        // Add tool to existing entry with same slug+scope
        const existing = manifest.skills.find((s) => s.name === link.slug && s.scope === linkScope);
        if (existing && !existing.tools.includes(link.tool)) {
          existing.tools.push(link.tool);
        }
      } else {
        manifest.skills.push({
          name: link.slug,
          tools: [link.tool],
          scope: linkScope,
        });
        seen.add(key);
      }
    }
  }

  await saveManifest(projectRoot, manifest);
  console.log(chalk.green(`✓ Created ${manifestPath}`));
  if (manifest.skills.length > 0) {
    console.log(chalk.dim(`  ${manifest.skills.length} skills added from current deployments.`));
  }
}
