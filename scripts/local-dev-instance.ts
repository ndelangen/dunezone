import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const FIRST_LOCAL_PORT = 12_000;
export const LOCAL_PORT_BLOCK_COUNT = 5000;

export function normalizeConvexDeploymentSelection(value: string | undefined): string | undefined {
  const selection = value ? stripInlineComment(value).trim() : '';
  return selection || undefined;
}

function stripInlineComment(value: string) {
  for (let index = 1; index < value.length; index += 1) {
    if (value[index] === '#' && /\s/u.test(value[index - 1])) {
      return value.slice(0, index);
    }
  }
  return value;
}

export type LocalDevelopmentInstance = {
  id: string;
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

type PortConfiguration = {
  value: string | undefined;
  name: string;
  fallback: number;
};

function assertDecimalPort(value: string, name: string) {
  if (![...value].every((character) => character >= '0' && character <= '9')) {
    throw new Error(`${name} must be an integer from 1 through 65535`);
  }
}

function portIsWithinRange(port: number) {
  return port >= 1 && port <= 65_535;
}

function assertPortRange(port: number, name: string) {
  if (!Number.isSafeInteger(port)) {
    throw new Error(`${name} must be an integer from 1 through 65535`);
  }
  if (!portIsWithinRange(port)) {
    throw new Error(`${name} must be an integer from 1 through 65535`);
  }
}

function parsePort(configuration: PortConfiguration): number {
  const candidate = configuration.value?.trim();
  if (!candidate) {
    return configuration.fallback;
  }
  assertDecimalPort(candidate, configuration.name);
  const port = Number(candidate);
  assertPortRange(port, configuration.name);
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

function localDevelopmentDigest(rootDirectory: string, processEnvironment: NodeJS.ProcessEnv) {
  const instanceSalt = processEnvironment.LOCAL_DEV_INSTANCE_ID?.trim() ?? '';
  return createHash('sha256')
    .update(`${path.resolve(rootDirectory)}\0${instanceSalt}`)
    .digest('hex');
}

export function resolveLocalDevelopmentInstanceIdentity(rootDirectory: string, processEnvironment: NodeJS.ProcessEnv) {
  const id = localDevelopmentDigest(rootDirectory, processEnvironment).slice(0, 12);
  return { id, composeProjectName: `dunezone-local-${id}` };
}

/**
 * Derives one stable Docker identity and preferred port block from the worktree path.
 * `LOCAL_DEV_INSTANCE_ID` adds a second isolated instance inside one worktree when needed.
 */
export function resolveLocalDevelopmentInstance(
  rootDirectory: string,
  processEnvironment: NodeJS.ProcessEnv,
  portBlockOffset = 0
): LocalDevelopmentInstance {
  const digest = localDevelopmentDigest(rootDirectory, processEnvironment);
  const { id, composeProjectName } = resolveLocalDevelopmentInstanceIdentity(rootDirectory, processEnvironment);
  const portBlock = (Number.parseInt(digest.slice(0, 8), 16) + portBlockOffset) % LOCAL_PORT_BLOCK_COUNT;
  const firstPort = FIRST_LOCAL_PORT + portBlock * 4;
  const appPort = parsePort({
    value: processEnvironment.APP_DEV_PORT ?? processEnvironment.PORT,
    name: 'APP_DEV_PORT or PORT',
    fallback: firstPort,
  });
  const backendPort = parsePort({
    value: processEnvironment.CONVEX_BACKEND_PORT,
    name: 'CONVEX_BACKEND_PORT',
    fallback: firstPort + 1,
  });
  const sitePort = parsePort({
    value: processEnvironment.CONVEX_SITE_PORT,
    name: 'CONVEX_SITE_PORT',
    fallback: firstPort + 2,
  });
  const dashboardPort = parsePort({
    value: processEnvironment.CONVEX_DASHBOARD_PORT,
    name: 'CONVEX_DASHBOARD_PORT',
    fallback: firstPort + 3,
  });

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
    id,
    composeProjectName,
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

export function localDevelopmentReservationDirectory(commonGitDirectory: string): string {
  return path.join(commonGitDirectory, 'local-dev-instances');
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
