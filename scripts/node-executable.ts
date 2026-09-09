import { accessSync, constants, realpathSync, statSync } from 'node:fs';
import path from 'node:path';

/** Resolve the operator's installed Node once; child processes never search PATH again. */
export function nodeExecutable(): string {
  const candidate = Bun.which('node');
  if (candidate === null || !path.isAbsolute(candidate)) {
    throw new Error('An installed Node executable with an absolute path is required.');
  }
  const executable = realpathSync(candidate);
  if (!statSync(executable).isFile()) {
    throw new Error('The installed Node path is not a regular file.');
  }
  accessSync(executable, constants.X_OK);
  return executable;
}
