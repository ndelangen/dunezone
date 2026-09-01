import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

import { recordLocalDevelopmentCleanup } from '../local-dev-cleanup';
import { createLocalDevelopmentInstance, localDevelopmentEnvironmentOverrides } from '../local-dev-instance';

const directory = process.env.TEST_DIRECTORY!;
if (process.argv[2] === 'child') {
  process.on('SIGTERM', () => {});
  writeFileSync(path.join(directory, 'child-pid'), String(process.pid));
  setInterval(() => {}, 1000);
} else {
  const temporaryDirectory = process.env.LOCAL_DEV_TEMPORARY_DIRECTORY!;
  const instance = createLocalDevelopmentInstance({});
  recordLocalDevelopmentCleanup(temporaryDirectory, {
    ...process.env,
    ...localDevelopmentEnvironmentOverrides(instance),
  });
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
