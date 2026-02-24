import fs from 'fs-extra';
import path from 'path';
import os from 'os';

export interface TmpSmHome {
  smHome: string;
  home: string;
  cleanup: () => Promise<void>;
}

/**
 * Create an isolated SM_HOME in os.tmpdir().
 * Sets SM_HOME and SM_TEST_HOME env vars so that dynamically imported
 * path constants point to the temp directory.
 *
 * Usage:
 *   const tmp = await createTmpSmHome();
 *   vi.resetModules();
 *   const { SM_HOME } = await import('../../src/fs/paths.js');
 *   // SM_HOME now points to tmp.smHome
 *   // ... run tests ...
 *   await tmp.cleanup();
 */
export async function createTmpSmHome(): Promise<TmpSmHome> {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'sm-test-'));
  const smHome = path.join(home, '.skill-manager');
  await fs.ensureDir(smHome);

  process.env.SM_TEST_HOME = home;
  process.env.SM_HOME = smHome;

  return {
    smHome,
    home,
    async cleanup() {
      delete process.env.SM_TEST_HOME;
      delete process.env.SM_HOME;
      await fs.remove(home);
    },
  };
}
