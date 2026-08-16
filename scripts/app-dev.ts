import { spawn, spawnSync } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { ensureLocalAuthUser } from './local-dev-auth';
import {
  backendUp,
  cloneProductionData,
  commandEnvironment,
  composeDown,
  configureLocalAuth,
  parseEnvFile,
  pushCode,
  remapOwnershipToLocalUsers,
  selfHostedEnvironment,
} from './provision';
import type { SelfHostedDeployment } from './provision';

type AppDevMode = 'cloud' | 'help' | 'local';

const rootDirectory = path.resolve(import.meta.dirname, '..');
const localEnvFile = process.env.LOCAL_DEV_ENV_FILE ?? path.join(rootDirectory, '.env.e2e.local');

export function parseAppDevMode(args: string[]): AppDevMode {
  if (args.length === 0) {
    return 'cloud';
  }
  if (args.length === 1 && args[0] === '--local') {
    return 'local';
  }
  if (args.length === 1 && (args[0] === '--help' || args[0] === '-h')) {
    return 'help';
  }
  throw new Error(`Unknown app:dev argument: ${args.join(' ')}`);
}

function requireValue(values: Record<string, string>, key: string) {
  const value = values[key]?.trim();
  if (!value || value === 'replace-me') {
    throw new Error(`Set ${key} in ${localEnvFile}`);
  }
  return value;
}

async function waitForUrl(url: string, processToWatch: ChildProcess) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (processToWatch.exitCode !== null) {
      throw new Error('The Vite development server exited before it became ready');
    }
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // The server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`The Vite development server did not become ready at ${url}`);
}

function startVite(port: string, env: NodeJS.ProcessEnv) {
  return spawn('bunx', ['vite', 'dev', '--port', port], {
    cwd: rootDirectory,
    env,
    stdio: 'inherit',
  });
}

async function waitForExit(child: ChildProcess) {
  return await new Promise<number>((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => resolve(code ?? 0));
  });
}

function printHelp() {
  console.log(`Usage:
  bun run app:dev          Start Vite with the configured online Convex deployment.
  bun run app:dev --local  Reset and start disposable local Convex, clone production
                           data, and enable the two local test accounts.`);
}

function runMigrationGuards(env: NodeJS.ProcessEnv) {
  const result = spawnSync(process.execPath, ['run', './scripts/migration-guards.ts', 'dev-strict', '300000', '2000'], {
    cwd: rootDirectory,
    env,
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    throw new Error('Local migration guards failed');
  }
}

async function runCloudDevelopment() {
  const port = process.env.APP_DEV_PORT ?? '3000';
  const vite = startVite(port, process.env);
  process.exitCode = await waitForExit(vite);
}

async function runLocalDevelopment() {
  const values = {
    ...parseEnvFile(readFileSync(localEnvFile, 'utf8')),
    ...Object.fromEntries(
      Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)
    ),
  };
  const port = process.env.APP_DEV_PORT ?? '3000';
  const baseUrl = `http://localhost:${port}`;
  const localUrl = values.CONVEX_SELF_HOSTED_URL ?? 'http://127.0.0.1:3210';
  const localSiteUrl = values.CONVEX_SITE_URL ?? 'http://127.0.0.1:3211';
  const ownerEmail = requireValue(values, 'PLAYWRIGHT_USER_A_EMAIL');
  const collaboratorEmail = requireValue(values, 'PLAYWRIGHT_USER_B_EMAIL');
  const password = requireValue(values, 'PLAYWRIGHT_USER_PASSWORD');
  const temporaryDirectory = mkdtempSync(path.join(tmpdir(), 'dunezone-app-dev-'));

  let vite: ChildProcess | null = null;
  let shuttingDown = false;
  let localEnv = commandEnvironment(process.env, {
    ...values,
    SITE_URL: baseUrl,
    VITE_CONVEX_URL: localUrl,
    CONVEX_SITE_URL: localSiteUrl,
    E2E_LOCAL_AUTH: 'true',
    VITE_E2E_LOCAL_AUTH: 'true',
    IS_TEST: 'true',
  });

  const cleanup = () => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    vite?.kill('SIGTERM');
    try {
      composeDown(localEnv);
    } finally {
      rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  };
  const stop = (exitCode: number) => {
    cleanup();
    process.exit(exitCode);
  };
  process.once('SIGINT', () => stop(130));
  process.once('SIGTERM', () => stop(143));
  process.once('exit', cleanup);

  try {
    console.log('Resetting disposable local Convex data...');
    const deployment: SelfHostedDeployment = await backendUp(localEnv, {
      url: localUrl,
      adminKey: values.CONVEX_SELF_HOSTED_ADMIN_KEY,
    });
    localEnv = commandEnvironment(localEnv, {
      CONVEX_SELF_HOSTED_URL: deployment.url,
      CONVEX_SELF_HOSTED_ADMIN_KEY: deployment.adminKey,
    });

    console.log('Configuring and deploying the local Convex backend...');
    configureLocalAuth(deployment, localEnv, {
      siteUrl: baseUrl,
      artifactsDirectory: temporaryDirectory,
    });
    pushCode(deployment, localEnv);

    console.log('Cloning production data into local Convex...');
    cloneProductionData(deployment, localEnv, temporaryDirectory);

    console.log('Preparing required local migrations...');
    runMigrationGuards(selfHostedEnvironment(localEnv, deployment));

    console.log('Starting the app and creating the two local accounts...');
    vite = startVite(port, localEnv);
    await waitForUrl(baseUrl, vite);
    await ensureLocalAuthUser(baseUrl, ownerEmail, password);
    await ensureLocalAuthUser(baseUrl, collaboratorEmail, password);

    console.log('Handing cloned factions and groups to the local reviewer accounts...');
    remapOwnershipToLocalUsers(deployment, localEnv, ownerEmail, collaboratorEmail);
    console.log(`Local development is ready at ${baseUrl}.`);
    console.log(`Sign in as ${ownerEmail} or ${collaboratorEmail} using the configured password.`);

    process.exitCode = await waitForExit(vite);
  } finally {
    cleanup();
  }
}

async function main() {
  const mode = parseAppDevMode(process.argv.slice(2));
  if (mode === 'help') {
    printHelp();
    return;
  }
  if (mode === 'local') {
    await runLocalDevelopment();
    return;
  }
  await runCloudDevelopment();
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
