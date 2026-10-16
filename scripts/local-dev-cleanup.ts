import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { composeDown, resolveDockerExecutable } from './provision';

const cleanupFile = 'compose-cleanup.json';
const dockerEnvironmentKeys = new Set([
  'HOME',
  'PATH',
  'SSH_AUTH_SOCK',
  'DOCKER_HOST',
  'DOCKER_CONTEXT',
  'DOCKER_CONFIG',
  'DOCKER_TLS',
  'DOCKER_TLS_VERIFY',
  'DOCKER_CERT_PATH',
  'DOCKER_API_VERSION',
]);

/** Record only this launch's Docker connection and project, before provisioning can create resources. */
export function recordLocalDevelopmentCleanup(directory: string, environment: NodeJS.ProcessEnv) {
  const dockerEnvironment = Object.fromEntries(
    Object.entries(environment).filter(([key]) => dockerEnvironmentKeys.has(key))
  );
  writeFileSync(
    path.join(directory, cleanupFile),
    JSON.stringify({
      ...dockerEnvironment,
      LOCAL_DEV_DOCKER_PATH: resolveDockerExecutable(environment),
      COMPOSE_PROJECT_NAME: environment.COMPOSE_PROJECT_NAME,
    }),
    { mode: 0o600 }
  );
}

function main() {
  const project = process.argv[2];
  let environment: NodeJS.ProcessEnv;
  if (project) {
    environment = { ...process.env, COMPOSE_PROJECT_NAME: project };
  } else {
    const directory = process.env.LOCAL_DEV_TEMPORARY_DIRECTORY;
    if (!directory || !existsSync(path.join(directory, cleanupFile))) {
      return;
    }
    environment = JSON.parse(readFileSync(path.join(directory, cleanupFile), 'utf8')) as NodeJS.ProcessEnv;
  }
  if (!/^dunezone-local-[a-f0-9-]{36}$/.test(environment.COMPOSE_PROJECT_NAME ?? '')) {
    throw new Error('Cleanup requires the dunezone-local UUID project printed by app:dev --local');
  }
  composeDown({ ...environment, COMPOSE_PROFILES: 'worktree-local' });
}

if (import.meta.main) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
