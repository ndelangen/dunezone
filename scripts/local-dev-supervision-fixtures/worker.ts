import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

import { recordLocalDevelopmentCleanup } from '../local-dev-cleanup';
import { createLocalDevelopmentInstance, localDevelopmentEnvironmentOverrides } from '../local-dev-instance';
import { lockPersistentDirectory } from '../local-dev-persistence';

const directory = process.env.TEST_DIRECTORY!;
if (process.argv[2] === 'child') {
  process.on('SIGTERM', () => {});
  writeFileSync(path.join(directory, 'child-pid'), String(process.pid));
  setInterval(() => {}, 1000);
} else {
  const temporaryDirectory = process.env.LOCAL_DEV_TEMPORARY_DIRECTORY!;
  const instance = createLocalDevelopmentInstance({});
  const persistent = process.env.TEST_PERSIST_DIRECTORY
    ? lockPersistentDirectory(process.env.TEST_PERSIST_DIRECTORY)
    : undefined;
  recordLocalDevelopmentCleanup(
    temporaryDirectory,
    { ...process.env, ...localDevelopmentEnvironmentOverrides(instance) },
    persistent
  );
  if (process.env.TEST_PERSIST_DIRECTORY) {
    writeFileSync(path.join(process.env.TEST_PERSIST_DIRECTORY, 'authored.json'), 'saved draft');
  }
  writeFileSync(path.join(temporaryDirectory, 'private-artifact'), 'temporary auth material');
  writeFileSync(
    path.join(directory, 'launch.json'),
    JSON.stringify({
      project: instance.composeProjectName,
      temporaryDirectory,
      workerPid: process.pid,
    })
  );
  if (process.env.TEST_MODE === 'failure') {
    process.exit(23);
  }
  spawnSync(process.execPath, ['--no-env-file', import.meta.filename, 'child'], { stdio: 'inherit' });
}
