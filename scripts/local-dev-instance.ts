import { randomInt, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

export function normalizeConvexDeploymentSelection(value: string | undefined): string | undefined {
  const selection = value?.split(/\s#/u, 1)[0]?.trim();
  return selection || undefined;
}

export type LocalDevelopmentInstance = {
  composeProjectName: string;
  appPort: number;
  backendPort: number;
  sitePort: number;
  dashboardPort: number;
  appUrl: string;
  backendUrl: string;
  siteUrl: string;
  dashboardUrl: string;
};

function parsePort(value: string | undefined, name: string, fallback: number): number {
  const candidate = value?.trim();
  if (!candidate) {
    return fallback;
  }
  const port = Number(candidate);
  if (!/^\d+$/u.test(candidate) || !Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`${name} must be an integer from 1 through 65535`);
  }
  return port;
}

function assertDistinctPorts(ports: Array<[name: string, port: number]>) {
  const owners = new Map<number, string>();
  for (const [name, port] of ports) {
    const owner = owners.get(port);
    if (owner) {
      throw new Error(`${name} and ${owner} both resolve to port ${port}`);
    }
    owners.set(port, name);
  }
}

/**
 * Each launch owns a fresh Docker project.
 * Docker and Vite bind the candidate ports;
 * an occupied port requires another launch.
 */
export function createLocalDevelopmentInstance(environment: NodeJS.ProcessEnv): LocalDevelopmentInstance {
  const firstPort = 12_000 + randomInt(7000) * 4;
  const appPort = parsePort(environment.APP_DEV_PORT ?? environment.PORT, 'APP_DEV_PORT or PORT', firstPort);
  const backendPort = parsePort(environment.CONVEX_BACKEND_PORT, 'CONVEX_BACKEND_PORT', firstPort + 1);
  const sitePort = parsePort(environment.CONVEX_SITE_PORT, 'CONVEX_SITE_PORT', firstPort + 2);
  const dashboardPort = parsePort(environment.CONVEX_DASHBOARD_PORT, 'CONVEX_DASHBOARD_PORT', firstPort + 3);

  if (sitePort === 3210) {
    throw new Error('CONVEX_SITE_PORT cannot be 3210 because the local OIDC proxy shares the backend network');
  }

  assertDistinctPorts([
    ['APP_DEV_PORT', appPort],
    ['CONVEX_BACKEND_PORT', backendPort],
    ['CONVEX_SITE_PORT', sitePort],
    ['CONVEX_DASHBOARD_PORT', dashboardPort],
  ]);

  return {
    composeProjectName: `dunezone-local-${randomUUID()}`,
    appPort,
    backendPort,
    sitePort,
    dashboardPort,
    appUrl: `http://127.0.0.1:${appPort}`,
    backendUrl: `http://127.0.0.1:${backendPort}`,
    siteUrl: `http://127.0.0.1:${sitePort}`,
    dashboardUrl: `http://127.0.0.1:${dashboardPort}`,
  };
}

export function resolveGitCommonDirectory(rootDirectory: string): string | undefined {
  const dotGitPath = path.join(rootDirectory, '.git');
  if (!existsSync(dotGitPath)) {
    return undefined;
  }
  if (statSync(dotGitPath).isDirectory()) {
    return path.resolve(dotGitPath);
  }
  const gitDirectoryLine = readFileSync(dotGitPath, 'utf8').trim();
  if (!gitDirectoryLine.startsWith('gitdir:')) {
    return undefined;
  }
  const gitDirectory = path.resolve(rootDirectory, gitDirectoryLine.slice('gitdir:'.length).trim());
  const commonDirectoryFile = path.join(gitDirectory, 'commondir');
  if (!existsSync(commonDirectoryFile)) {
    return gitDirectory;
  }
  return path.resolve(gitDirectory, readFileSync(commonDirectoryFile, 'utf8').trim());
}

/** Values that must describe the same local instance to Vite, Convex, and Docker Compose. */
export function localDevelopmentEnvironmentOverrides(
  instance: LocalDevelopmentInstance
): Record<string, string | undefined> {
  return {
    APP_DEV_PORT: String(instance.appPort),
    PORT: String(instance.appPort),
    COMPOSE_PROJECT_NAME: instance.composeProjectName,
    COMPOSE_PROFILES: 'worktree-local',
    CONVEX_BACKEND_PORT: String(instance.backendPort),
    CONVEX_SITE_PORT: String(instance.sitePort),
    CONVEX_DASHBOARD_PORT: String(instance.dashboardPort),
    CONVEX_CLOUD_ORIGIN: instance.backendUrl,
    CONVEX_SITE_ORIGIN: instance.siteUrl,
    NEXT_PUBLIC_DEPLOYMENT_URL: instance.backendUrl,
    CONVEX_SELF_HOSTED_URL: instance.backendUrl,
    CONVEX_SELF_HOSTED_ADMIN_KEY: undefined,
    VITE_CONVEX_URL: instance.backendUrl,
    CONVEX_SITE_URL: instance.siteUrl,
    SITE_URL: instance.appUrl,
  };
}

type LocalEnvironmentFileSearch = {
  rootDirectory: string;
  fileName: '.env.e2e.local' | '.env.local';
  commonGitDirectory?: string;
};

function resolveWorktreeOrMainFile(search: LocalEnvironmentFileSearch): string {
  const { rootDirectory, fileName, commonGitDirectory } = search;
  const worktreePath = path.join(rootDirectory, fileName);
  if (existsSync(worktreePath) || !commonGitDirectory) {
    return worktreePath;
  }

  const sharedPath = path.join(path.dirname(path.resolve(rootDirectory, commonGitDirectory)), fileName);
  return existsSync(sharedPath) ? sharedPath : worktreePath;
}

/** Uses worktree credentials first, then the main checkout's ignored credentials file. */
export function resolveLocalDevelopmentEnvFile(
  rootDirectory: string,
  processEnvironment: NodeJS.ProcessEnv,
  commonGitDirectory?: string
): string {
  const explicitPath = processEnvironment.LOCAL_DEV_ENV_FILE?.trim();
  if (explicitPath) {
    return path.resolve(rootDirectory, explicitPath);
  }
  return resolveWorktreeOrMainFile({ rootDirectory, fileName: '.env.e2e.local', commonGitDirectory });
}

/** Finds the Convex project selection needed for the production snapshot export. */
export function resolveLocalDevelopmentProjectEnvFile(rootDirectory: string, commonGitDirectory?: string): string {
  return resolveWorktreeOrMainFile({ rootDirectory, fileName: '.env.local', commonGitDirectory });
}
