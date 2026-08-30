import { Database } from 'bun:sqlite';
import { spawn, spawnSync } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
  LOCAL_PORT_BLOCK_COUNT,
  localDevelopmentEnvironmentOverrides,
  resolveLocalDevelopmentInstance,
  resolveLocalDevelopmentInstanceIdentity,
} from './local-dev-instance';
import type { LocalDevelopmentInstance } from './local-dev-instance';
import {
  CleanupFenceHeldError,
  CleanupProcessGroup,
  PROCESS_INSPECTION_ENVIRONMENT,
  processIdentityIsLive,
  requireProcessIdentity,
  resolveReservationProcessIdentities,
  waitForChildExit,
  waitForChildStart,
} from './local-dev-process';
import type { ProcessIdentity } from './local-dev-process';
import { commandEnvironment, resolveDockerExecutable } from './provision';

const COMPOSE_DOWN_TIMEOUT_MILLISECONDS = 30_000;
const CLEANUP_GUARDIAN_TIMEOUT_MILLISECONDS = COMPOSE_DOWN_TIMEOUT_MILLISECONDS + 10_000;
const currentRootDirectory = path.resolve(import.meta.dirname, '..');
const composeFileName = 'docker-compose.convex-local.yml';
const cleanupGuardianPath = path.resolve(import.meta.dirname, 'local-dev-reservation.ts');
const portProbeSource = `
  const net = require('node:net');
  const ports = JSON.parse(process.argv[1]);
  const servers = [];
  const closeServers = async () => {
    await Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve))));
  };
  const listen = (host, port) => new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', (error) => {
      if (host === '::1' && error.code === 'EADDRNOTAVAIL') {
        resolve();
        return;
      }
      reject(error);
    });
    server.listen({ host, port, exclusive: true, ...(host === '::1' ? { ipv6Only: true } : {}) }, () => {
      servers.push(server);
      resolve();
    });
  });
  (async () => {
    try {
      for (const port of ports) {
        await listen('127.0.0.1', port);
        await listen('::1', port);
      }
      await closeServers();
    } catch (error) {
      await closeServers();
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  })();
`;

type ReservationRow = {
  instanceId: string;
  rootDirectory: string;
  reservationToken: string;
  ownerPid: number;
  ownerStartedAt: string;
  workerPid: number;
  workerStartedAt: string;
  appPort: number;
  backendPort: number;
  sitePort: number;
  dashboardPort: number;
};

type ReservationRequest = {
  configuredPorts: Set<number>;
  identity: ReturnType<typeof resolveLocalDevelopmentInstanceIdentity>;
  owner: ProcessIdentity;
  processEnvironment: NodeJS.ProcessEnv;
  reservationToken: string;
  rootDirectory: string;
  worker: ProcessIdentity;
};

export type ReservedLocalDevelopmentInstance = LocalDevelopmentInstance & {
  reservationToken: string;
};

export type LocalDevelopmentReservationOptions = {
  reservationToken?: string;
};

function reservationDatabasePath(reservationDirectory: string) {
  return path.join(reservationDirectory, 'reservations.sqlite');
}

function openReservationDatabase(reservationDirectory: string) {
  mkdirSync(reservationDirectory, { recursive: true, mode: 0o700 });
  chmodSync(reservationDirectory, 0o700);
  const database = new Database(reservationDatabasePath(reservationDirectory), {
    create: true,
    strict: true,
  });
  database.exec('PRAGMA busy_timeout = 30000');
  database.exec('PRAGMA foreign_keys = ON');
  database.exec(`
    CREATE TABLE IF NOT EXISTS local_development_instances (
      instance_id TEXT PRIMARY KEY,
      root_directory TEXT NOT NULL,
      reservation_token TEXT NOT NULL,
      owner_pid INTEGER NOT NULL,
      owner_started_at TEXT NOT NULL,
      worker_pid INTEGER NOT NULL,
      worker_started_at TEXT NOT NULL,
      app_port INTEGER NOT NULL,
      backend_port INTEGER NOT NULL,
      site_port INTEGER NOT NULL,
      dashboard_port INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS local_development_ports (
      port INTEGER PRIMARY KEY CHECK (port BETWEEN 1 AND 65535),
      instance_id TEXT NOT NULL REFERENCES local_development_instances(instance_id) ON DELETE CASCADE
    );
  `);
  return database;
}

function withReservationDatabase<Result>(
  reservationDirectory: string,
  operation: (database: Database) => Result
): Result {
  const database = openReservationDatabase(reservationDirectory);
  try {
    return operation(database);
  } finally {
    database.close();
  }
}

function reservationIsLive(reservation: ReservationRow) {
  const owners: ProcessIdentity[] = [
    { pid: reservation.ownerPid, startedAt: reservation.ownerStartedAt },
    { pid: reservation.workerPid, startedAt: reservation.workerStartedAt },
  ];
  return owners.some(processIdentityIsLive);
}

type DockerInspection = {
  Config?: {
    Labels?: Record<string, string>;
  };
  HostConfig?: {
    PortBindings?: Record<string, Array<{ HostIp?: string; HostPort?: string }> | null>;
  };
};

type DockerCommandContext = {
  environment: NodeJS.ProcessEnv;
  executable: string;
};

function dockerCommandContext(environment: NodeJS.ProcessEnv, executable = resolveDockerExecutable(environment)) {
  return { environment, executable } satisfies DockerCommandContext;
}

function runDockerCommand(context: DockerCommandContext, args: string[]) {
  const result = spawnSync(context.executable, args, {
    cwd: currentRootDirectory,
    encoding: 'utf8',
    env: context.environment,
  });
  if (result.error) {
    throw new Error(`${context.executable} ${args.join(' ')} failed: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const details = result.stderr.trim();
    throw new Error(`${context.executable} ${args.join(' ')} failed${details ? `: ${details}` : ''}`);
  }
  return result.stdout;
}

function runDocker(args: string[], environment: NodeJS.ProcessEnv) {
  return runDockerCommand(dockerCommandContext(environment), args);
}

type DockerProjectResource = 'container' | 'network' | 'volume';

function projectResourceIdsForProject(
  resource: DockerProjectResource,
  composeProjectName: string,
  context: DockerCommandContext
) {
  const listArgs = resource === 'container' ? ['ps', '-a'] : [resource, 'ls'];
  const outputFormat = resource === 'volume' ? '{{.Name}}' : '{{.ID}}';
  return runDockerCommand(context, [
    ...listArgs,
    '--filter',
    `label=com.docker.compose.project=${composeProjectName}`,
    '--format',
    outputFormat,
  ])
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function projectResourceIds(
  resource: DockerProjectResource,
  instance: LocalDevelopmentInstance,
  environment: NodeJS.ProcessEnv
) {
  return projectResourceIdsForProject(resource, instance.composeProjectName, dockerCommandContext(environment));
}

function projectContainerIds(instance: LocalDevelopmentInstance, environment: NodeJS.ProcessEnv) {
  return projectResourceIds('container', instance, environment);
}

function assertProjectResourcesRemoved(instance: LocalDevelopmentInstance, environment: NodeJS.ProcessEnv) {
  for (const resource of ['container', 'network', 'volume'] as const) {
    if (projectResourceIds(resource, instance, environment).length > 0) {
      throw new Error(`Docker project ${instance.composeProjectName} still has a ${resource} after cleanup`);
    }
  }
}

function projectResourceRemovalArgs(resource: DockerProjectResource, resourceIds: string[]) {
  if (resource === 'container') {
    return ['container', 'rm', '--force', ...resourceIds];
  }
  if (resource === 'network') {
    return ['network', 'rm', ...resourceIds];
  }
  return ['volume', 'rm', '--force', ...resourceIds];
}

function sweepProjectResources(composeProjectName: string, context: DockerCommandContext) {
  const removalErrors: unknown[] = [];
  for (const resource of ['container', 'network', 'volume'] as const) {
    const resourceIds = projectResourceIdsForProject(resource, composeProjectName, context);
    if (resourceIds.length === 0) {
      continue;
    }
    try {
      runDockerCommand(context, projectResourceRemovalArgs(resource, resourceIds));
    } catch (error) {
      removalErrors.push(error);
    }
  }

  const remainingResources = (['container', 'network', 'volume'] as const).flatMap((resource) =>
    projectResourceIdsForProject(resource, composeProjectName, context).map((resourceId) => `${resource} ${resourceId}`)
  );
  if (remainingResources.length > 0) {
    throw new AggregateError(
      removalErrors,
      `Docker project ${composeProjectName} still has labelled resources after cleanup: ${remainingResources.join(', ')}`
    );
  }
}

function expectedPortsByService(reservation: ReservationRow): Record<string, Record<string, number>> {
  return {
    backend: {
      '3210/tcp': reservation.backendPort,
      '3211/tcp': reservation.sitePort,
    },
    dashboard: {
      '6791/tcp': reservation.dashboardPort,
    },
  };
}

type ContainerOwnership = {
  configFiles: string[];
  projectName?: string;
  service?: string;
  workingDirectory: string;
};

function containerOwnership(inspection: DockerInspection): ContainerOwnership {
  const labels = inspection.Config?.Labels;
  return {
    configFiles:
      labels?.['com.docker.compose.project.config_files']?.split(',').map((value) => path.resolve(value)) ?? [],
    projectName: labels?.['com.docker.compose.project'],
    service: labels?.['com.docker.compose.service'],
    workingDirectory: path.resolve(labels?.['com.docker.compose.project.working_dir'] ?? ''),
  };
}

function ownershipMatchesReservation(
  ownership: ContainerOwnership,
  reservation: ReservationRow,
  instance: LocalDevelopmentInstance
): ownership is ContainerOwnership & { service: string } {
  const expectedWorkingDirectory = path.resolve(reservation.rootDirectory);
  const expectedConfigFile = path.join(expectedWorkingDirectory, composeFileName);
  return [
    ownership.projectName === instance.composeProjectName,
    ownership.workingDirectory === expectedWorkingDirectory,
    ownership.configFiles.includes(expectedConfigFile),
    Boolean(ownership.service),
  ].every(Boolean);
}

function requireOwnedContainerService(
  reservation: ReservationRow,
  instance: LocalDevelopmentInstance,
  containerId: string,
  inspection: DockerInspection
) {
  const ownership = containerOwnership(inspection);
  if (!ownershipMatchesReservation(ownership, reservation, instance)) {
    throw new Error(`Container ${containerId} does not match local Convex reservation ${reservation.instanceId}`);
  }
  return ownership.service;
}

function portBindingMatches(binding: { HostIp?: string; HostPort?: string }, expectedHostPort: number) {
  return binding.HostIp === '127.0.0.1' && binding.HostPort === String(expectedHostPort);
}

function portBindingsMatch(bindings: Array<{ HostIp?: string; HostPort?: string }> | null | undefined, port: number) {
  if (!bindings?.length) {
    return false;
  }
  return bindings.every((binding) => portBindingMatches(binding, port));
}

function assertContainerPortBindings(
  containerId: string,
  inspection: DockerInspection,
  expectedPorts: Record<string, number>
) {
  const portBindings = inspection.HostConfig?.PortBindings ?? {};
  for (const [containerPort, expectedHostPort] of Object.entries(expectedPorts)) {
    const bindings = portBindings[containerPort];
    if (!portBindingsMatch(bindings, expectedHostPort)) {
      throw new Error(
        `Container ${containerId} does not bind reserved port ${expectedHostPort} to 127.0.0.1 for ${containerPort}`
      );
    }
  }
}

function assertContainerOwnership(
  reservation: ReservationRow,
  instance: LocalDevelopmentInstance,
  containerIds: string[],
  environment: NodeJS.ProcessEnv
) {
  const expectedServices = expectedPortsByService(reservation);

  for (const containerId of containerIds) {
    const inspections = JSON.parse(runDocker(['inspect', containerId], environment)) as DockerInspection[];
    const inspection = inspections[0];
    if (!inspection) {
      throw new Error(`Docker did not return inspection data for container ${containerId}`);
    }
    const service = requireOwnedContainerService(reservation, instance, containerId, inspection);
    const expectedPorts = expectedServices[service];
    if (expectedPorts) {
      assertContainerPortBindings(containerId, inspection, expectedPorts);
    }
  }
}

function probePorts(ports: number[]) {
  const result = spawnSync(process.execPath, ['-e', portProbeSource, JSON.stringify(ports)], {
    encoding: 'utf8',
    env: PROCESS_INSPECTION_ENVIRONMENT,
  });
  if (result.error) {
    throw new Error(`Could not verify released local ports: ${result.error.message}`);
  }
  return { free: result.status === 0, details: result.stderr.trim() };
}

function assertConfiguredPortsAreFree(configuredPorts: Set<number>) {
  for (const port of configuredPorts) {
    const probe = probePorts([port]);
    if (!probe.free) {
      throw new Error(`Configured local development port ${port} is already in use`);
    }
  }
}

function assertReservedPortsAreFree(reservation: ReservationRow) {
  const ports = [reservation.appPort, reservation.backendPort, reservation.sitePort, reservation.dashboardPort];
  const probe = probePorts(ports);
  if (!probe.free) {
    throw new Error(
      `Local Convex reservation ${reservation.instanceId} still has a listener on one of its ports${
        probe.details ? `: ${probe.details}` : ''
      }`
    );
  }
}

function explicitPorts(processEnvironment: NodeJS.ProcessEnv) {
  const values = [
    processEnvironment.APP_DEV_PORT ?? processEnvironment.PORT,
    processEnvironment.CONVEX_BACKEND_PORT,
    processEnvironment.CONVEX_SITE_PORT,
    processEnvironment.CONVEX_DASHBOARD_PORT,
  ];
  return new Set(
    values
      .filter((value): value is string => Boolean(value?.trim()))
      .map(Number)
      .filter((port) => Number.isSafeInteger(port) && port >= 1 && port <= 65_535)
  );
}

function rowToInstance(row: ReservationRow): ReservedLocalDevelopmentInstance {
  return {
    id: row.instanceId,
    composeProjectName: `dunezone-local-${row.instanceId}`,
    appPort: row.appPort,
    backendPort: row.backendPort,
    sitePort: row.sitePort,
    dashboardPort: row.dashboardPort,
    appUrl: `http://127.0.0.1:${row.appPort}`,
    backendUrl: `http://127.0.0.1:${row.backendPort}`,
    siteUrl: `http://127.0.0.1:${row.sitePort}`,
    dashboardUrl: `http://127.0.0.1:${row.dashboardPort}`,
    reservationToken: row.reservationToken,
  };
}

function findReservation(database: Database, instanceId: string) {
  return database
    .query<ReservationRow, [string]>(
      `
      SELECT
        instance_id AS instanceId,
        root_directory AS rootDirectory,
        reservation_token AS reservationToken,
        owner_pid AS ownerPid,
        owner_started_at AS ownerStartedAt,
        worker_pid AS workerPid,
        worker_started_at AS workerStartedAt,
        app_port AS appPort,
        backend_port AS backendPort,
        site_port AS sitePort,
        dashboard_port AS dashboardPort
      FROM local_development_instances
      WHERE instance_id = ?
    `
    )
    .get(instanceId);
}

function listReservations(database: Database) {
  return database
    .query<ReservationRow, []>(
      `
      SELECT
        instance_id AS instanceId,
        root_directory AS rootDirectory,
        reservation_token AS reservationToken,
        owner_pid AS ownerPid,
        owner_started_at AS ownerStartedAt,
        worker_pid AS workerPid,
        worker_started_at AS workerStartedAt,
        app_port AS appPort,
        backend_port AS backendPort,
        site_port AS sitePort,
        dashboard_port AS dashboardPort
      FROM local_development_instances
    `
    )
    .all();
}

export function readLocalDevelopmentInstanceReservation(
  rootDirectory: string,
  processEnvironment: NodeJS.ProcessEnv,
  reservationDirectory: string
): ReservedLocalDevelopmentInstance | undefined {
  const expected = resolveLocalDevelopmentInstanceIdentity(rootDirectory, processEnvironment);
  return withReservationDatabase(reservationDirectory, (database) => {
    const reservation = findReservation(database, expected.id);
    if (!reservation || path.resolve(reservation.rootDirectory) !== path.resolve(rootDirectory)) {
      return undefined;
    }
    return rowToInstance(reservation);
  });
}

function createReservationRequest(
  rootDirectory: string,
  processEnvironment: NodeJS.ProcessEnv,
  options: LocalDevelopmentReservationOptions
): ReservationRequest {
  const identity = resolveLocalDevelopmentInstanceIdentity(rootDirectory, processEnvironment);
  const configuredPorts = explicitPorts(processEnvironment);
  const { owner, worker } = resolveReservationProcessIdentities(processEnvironment);
  return {
    configuredPorts,
    identity,
    owner,
    processEnvironment,
    reservationToken: options.reservationToken ?? randomUUID(),
    rootDirectory: path.resolve(rootDirectory),
    worker,
  };
}

function reservationBelongsToRequest(reservation: ReservationRow, request: ReservationRequest) {
  return (
    reservation.instanceId === request.identity.id && path.resolve(reservation.rootDirectory) === request.rootDirectory
  );
}

function assertReservationSlotIsEmpty(existing: ReservationRow | null, request: ReservationRequest) {
  if (!existing) {
    return;
  }
  if (!reservationBelongsToRequest(existing, request)) {
    throw new Error(`Local Convex reservation ${request.identity.id} does not belong to this worktree`);
  }
  if (reservationIsLive(existing)) {
    throw new Error(`Local Convex instance ${request.identity.id} is already running in this worktree`);
  }
  throw new Error(
    `Abandoned local Convex instance ${request.identity.id} could not be cleaned, so its ports remain reserved`
  );
}

function instancePorts(instance: LocalDevelopmentInstance): [number, number, number, number] {
  return [instance.appPort, instance.backendPort, instance.sitePort, instance.dashboardPort];
}

function reservedPortCollision(database: Database, ports: [number, number, number, number]) {
  return database
    .query<{ port: number }, [number, number, number, number]>(
      'SELECT port FROM local_development_ports WHERE port IN (?, ?, ?, ?) LIMIT 1'
    )
    .get(...ports);
}

function candidatePortsAreAvailable(
  database: Database,
  instance: LocalDevelopmentInstance,
  configuredPorts: Set<number>
) {
  const ports = instancePorts(instance);
  const collision = reservedPortCollision(database, ports);
  if (collision) {
    if (configuredPorts.has(collision.port)) {
      throw new Error(`Configured port ${collision.port} is reserved by another local worktree`);
    }
    return false;
  }
  if (probePorts(ports).free) {
    return true;
  }
  assertConfiguredPortsAreFree(configuredPorts);
  return false;
}

type CandidateResolution = { instance: LocalDevelopmentInstance } | { error: unknown };

function resolveCandidate(request: ReservationRequest, offset: number): CandidateResolution {
  try {
    return {
      instance: resolveLocalDevelopmentInstance(request.rootDirectory, request.processEnvironment, offset),
    };
  } catch (error) {
    return { error };
  }
}

function findAvailableInstance(database: Database, request: ReservationRequest) {
  let firstResolutionError: unknown;
  let foundValidCandidate = false;
  for (let offset = 0; offset < LOCAL_PORT_BLOCK_COUNT; offset += 1) {
    const candidate = resolveCandidate(request, offset);
    if ('error' in candidate) {
      firstResolutionError ??= candidate.error;
      continue;
    }
    foundValidCandidate = true;
    if (candidatePortsAreAvailable(database, candidate.instance, request.configuredPorts)) {
      return candidate.instance;
    }
  }
  if (!foundValidCandidate && firstResolutionError) {
    throw firstResolutionError;
  }
  throw new Error('No local four-port block is available for this worktree');
}

function insertReservation(database: Database, request: ReservationRequest, instance: LocalDevelopmentInstance) {
  database
    .query(
      `
      INSERT INTO local_development_instances (
        instance_id,
        root_directory,
        reservation_token,
        owner_pid,
        owner_started_at,
        worker_pid,
        worker_started_at,
        app_port,
        backend_port,
        site_port,
        dashboard_port
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    )
    .run(
      instance.id,
      request.rootDirectory,
      request.reservationToken,
      request.owner.pid,
      request.owner.startedAt,
      request.worker.pid,
      request.worker.startedAt,
      instance.appPort,
      instance.backendPort,
      instance.sitePort,
      instance.dashboardPort
    );
  const insertPort = database.query('INSERT INTO local_development_ports (port, instance_id) VALUES (?, ?)');
  for (const port of instancePorts(instance)) {
    insertPort.run(port, instance.id);
  }
}

function reserveInDatabase(database: Database, request: ReservationRequest) {
  assertReservationSlotIsEmpty(findReservation(database, request.identity.id), request);
  const instance = findAvailableInstance(database, request);
  insertReservation(database, request, instance);
  return { ...instance, reservationToken: request.reservationToken };
}

/** Reserves a non-overlapping port block across every worktree in this Git checkout. */
export async function reserveLocalDevelopmentInstance(
  rootDirectory: string,
  processEnvironment: NodeJS.ProcessEnv,
  reservationDirectory: string,
  options: LocalDevelopmentReservationOptions = {}
): Promise<ReservedLocalDevelopmentInstance> {
  await reapAbandonedLocalDevelopmentInstances(processEnvironment, reservationDirectory);
  const request = createReservationRequest(rootDirectory, processEnvironment, options);
  return withReservationDatabase(reservationDirectory, (database) =>
    database.transaction(() => reserveInDatabase(database, request)).immediate()
  );
}

type CleanupClaim = {
  claimedInstance: ReservedLocalDevelopmentInstance;
  previousReservation: ReservationRow;
};

function claimLocalDevelopmentInstanceCleanup(
  instance: ReservedLocalDevelopmentInstance,
  reservationDirectory: string,
  onlyIfStale: boolean
): CleanupClaim | undefined {
  const cleanupProcess = requireProcessIdentity({ pid: process.pid, role: 'cleanup' });
  const cleanupToken = randomUUID();
  return withReservationDatabase(reservationDirectory, (database) => {
    const claim = database.transaction(() => {
      const reservation = findReservation(database, instance.id);
      if (!reservation || reservation.reservationToken !== instance.reservationToken) {
        return undefined;
      }
      if (onlyIfStale && reservationIsLive(reservation)) {
        return undefined;
      }
      const result = database
        .query(
          `
          UPDATE local_development_instances
          SET
            reservation_token = ?,
            owner_pid = ?,
            owner_started_at = ?,
            worker_pid = ?,
            worker_started_at = ?
          WHERE instance_id = ? AND reservation_token = ?
        `
        )
        .run(
          cleanupToken,
          cleanupProcess.pid,
          cleanupProcess.startedAt,
          cleanupProcess.pid,
          cleanupProcess.startedAt,
          reservation.instanceId,
          reservation.reservationToken
        );
      if (result.changes !== 1) {
        return undefined;
      }
      return {
        claimedInstance: rowToInstance({
          ...reservation,
          reservationToken: cleanupToken,
          ownerPid: cleanupProcess.pid,
          ownerStartedAt: cleanupProcess.startedAt,
          workerPid: cleanupProcess.pid,
          workerStartedAt: cleanupProcess.startedAt,
        }),
        previousReservation: reservation,
      };
    });
    return claim.immediate();
  });
}

function restoreLocalDevelopmentInstanceCleanup(claim: CleanupClaim, reservationDirectory: string) {
  const { claimedInstance, previousReservation } = claim;
  withReservationDatabase(reservationDirectory, (database) => {
    const restore = database.transaction(() => {
      database
        .query(
          `
          UPDATE local_development_instances
          SET
            reservation_token = ?,
            owner_pid = ?,
            owner_started_at = ?,
            worker_pid = ?,
            worker_started_at = ?
          WHERE instance_id = ? AND reservation_token = ?
        `
        )
        .run(
          previousReservation.reservationToken,
          previousReservation.ownerPid,
          previousReservation.ownerStartedAt,
          previousReservation.workerPid,
          previousReservation.workerStartedAt,
          previousReservation.instanceId,
          claimedInstance.reservationToken
        );
    });
    restore.immediate();
  });
}

function completeLocalDevelopmentInstanceCleanup(claim: CleanupClaim, reservationDirectory: string) {
  withReservationDatabase(reservationDirectory, (database) => {
    const complete = database.transaction(() => {
      const result = database
        .query('DELETE FROM local_development_instances WHERE instance_id = ? AND reservation_token = ?')
        .run(claim.claimedInstance.id, claim.claimedInstance.reservationToken);
      if (result.changes < 1) {
        throw new Error(`Local Convex cleanup lost reservation ${claim.claimedInstance.id}`);
      }
    });
    complete.immediate();
  });
}

function fenceCleanupChild(claim: CleanupClaim, reservationDirectory: string, cleanupChild: ProcessIdentity) {
  withReservationDatabase(reservationDirectory, (database) => {
    const fence = database.transaction(() => {
      const result = database
        .query(
          `
          UPDATE local_development_instances
          SET worker_pid = ?, worker_started_at = ?
          WHERE instance_id = ? AND reservation_token = ?
        `
        )
        .run(
          cleanupChild.pid,
          cleanupChild.startedAt,
          claim.claimedInstance.id,
          claim.claimedInstance.reservationToken
        );
      if (result.changes !== 1) {
        throw new Error(`Local Convex cleanup lost reservation ${claim.claimedInstance.id}`);
      }
    });
    fence.immediate();
  });
}

async function waitForCleanupGate(gatePath: string) {
  for (let attempt = 0; attempt < 3000; attempt += 1) {
    if (existsSync(gatePath)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return false;
}

type CleanupGuardianConfiguration = {
  composeFile: string;
  composeProjectName: string;
  docker: DockerCommandContext;
  gatePath: string;
};

type RunningDockerCleanup = {
  child: ChildProcess;
  deadline: number;
  processGroup: CleanupProcessGroup;
};

function parseCleanupGuardianArguments(args: string[]): CleanupGuardianConfiguration {
  const guardianArguments = args.slice(0, 4);
  if (guardianArguments.filter(Boolean).length !== 4) {
    throw new Error('Incomplete local Convex cleanup guardian arguments');
  }
  const [gatePath, executable, composeFile, composeProjectName] = guardianArguments as [string, string, string, string];
  if (![executable, composeFile].every((value) => path.isAbsolute(value))) {
    throw new Error('Local Convex cleanup guardian paths must be absolute');
  }
  return {
    composeFile,
    composeProjectName,
    docker: dockerCommandContext(process.env, executable),
    gatePath,
  };
}

async function startDockerCleanup(configuration: CleanupGuardianConfiguration): Promise<RunningDockerCleanup> {
  const child = spawn(
    configuration.docker.executable,
    ['compose', '-f', configuration.composeFile, 'down', '-v', '--remove-orphans'],
    {
      cwd: path.dirname(configuration.composeFile),
      detached: true,
      env: configuration.docker.environment,
      stdio: 'inherit',
    }
  );
  const processGroupId = await waitForChildStart({ child, label: 'The Docker cleanup command' });
  return {
    child,
    deadline: Date.now() + COMPOSE_DOWN_TIMEOUT_MILLISECONDS,
    processGroup: new CleanupProcessGroup(processGroupId),
  };
}

function errorFromUnknown(error: unknown) {
  return error instanceof Error ? error : new Error(String(error));
}

function dockerComposeExitError(result: { code: number | null; signal: NodeJS.Signals | null }) {
  if (result.code === 0) {
    return undefined;
  }
  const status = result.signal ?? String(result.code);
  return new Error(`docker compose down failed with ${status}`);
}

async function recoverTimedOutDockerCleanup(processGroup: CleanupProcessGroup) {
  try {
    await processGroup.terminate();
  } catch (error) {
    console.error(
      `Could not drain Docker cleanup process group ${processGroup.id}: ${errorFromUnknown(error).message}`
    );
    await processGroup.holdFenceUntilDrained();
  }
}

async function dockerCleanupFailure(cleanup: RunningDockerCleanup): Promise<Error | undefined> {
  try {
    const result = await waitForChildExit({
      child: cleanup.child,
      timeoutMilliseconds: Math.max(1, cleanup.deadline - Date.now()),
      label: 'docker compose down',
    });
    await cleanup.processGroup.waitForDrain(cleanup.deadline);
    return dockerComposeExitError(result);
  } catch (error) {
    await recoverTimedOutDockerCleanup(cleanup.processGroup);
    return errorFromUnknown(error);
  }
}

function combineCleanupErrors(composeError: Error | undefined, sweepError: unknown): Error {
  const normalizedSweepError = errorFromUnknown(sweepError);
  if (!composeError) {
    return normalizedSweepError;
  }
  return new AggregateError(
    [composeError, sweepError],
    `${composeError.message}; exact project-label cleanup failed: ${normalizedSweepError.message}`
  );
}

function sweepAfterDockerCleanup(configuration: CleanupGuardianConfiguration, composeError: Error | undefined) {
  try {
    sweepProjectResources(configuration.composeProjectName, configuration.docker);
  } catch (error) {
    throw combineCleanupErrors(composeError, error);
  }
}

async function runCleanupGuardian(args: string[]) {
  const configuration = parseCleanupGuardianArguments(args);
  if (!(await waitForCleanupGate(configuration.gatePath))) {
    console.error(`Local Convex cleanup guardian timed out waiting for ${configuration.gatePath}`);
    return 75;
  }
  const cleanup = await startDockerCleanup(configuration);
  sweepAfterDockerCleanup(configuration, await dockerCleanupFailure(cleanup));
  return 0;
}

type CleanupGuardian = {
  child: ChildProcess;
  gatePath: string;
  outputDetails: () => string;
};

function startCleanupGuardian(
  claim: CleanupClaim,
  reservationDirectory: string,
  environment: NodeJS.ProcessEnv
): CleanupGuardian {
  const gatePath = path.join(reservationDirectory, `.cleanup-${claim.claimedInstance.id}-${randomUUID()}.ready`);
  const reservedComposeFile = path.join(claim.previousReservation.rootDirectory, composeFileName);
  const composeFile = existsSync(reservedComposeFile)
    ? reservedComposeFile
    : path.join(currentRootDirectory, composeFileName);
  const executable = resolveDockerExecutable(environment);
  const child = spawn(
    process.execPath,
    [
      cleanupGuardianPath,
      'cleanup-guardian',
      gatePath,
      executable,
      composeFile,
      claim.claimedInstance.composeProjectName,
    ],
    {
      cwd: currentRootDirectory,
      detached: true,
      env: environment,
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );
  let stdout = '';
  let stderr = '';
  child.stdout?.on('data', (chunk: Buffer | string) => {
    stdout += chunk.toString();
  });
  child.stderr?.on('data', (chunk: Buffer | string) => {
    stderr += chunk.toString();
  });
  return {
    child,
    gatePath,
    outputDetails: () => stderr.trim() || stdout.trim(),
  };
}

async function openCleanupGuardian(guardian: CleanupGuardian, claim: CleanupClaim, reservationDirectory: string) {
  const cleanupPid = await waitForChildStart({ child: guardian.child, label: 'The local Convex cleanup guardian' });
  const cleanupIdentity = requireProcessIdentity({ pid: cleanupPid, role: 'cleanup guardian' });
  fenceCleanupChild(claim, reservationDirectory, cleanupIdentity);
  writeFileSync(guardian.gatePath, 'ready', { flag: 'wx', mode: 0o600 });
}

async function requireCleanupGuardianSuccess(guardian: CleanupGuardian) {
  const result = await waitForChildExit({
    child: guardian.child,
    timeoutMilliseconds: CLEANUP_GUARDIAN_TIMEOUT_MILLISECONDS,
    label: 'local Convex cleanup guardian',
  });
  if (result.code !== 0) {
    const status = result.signal ?? String(result.code);
    const details = guardian.outputDetails();
    throw new Error(`Local Convex Docker cleanup failed with ${status}${details ? `: ${details}` : ''}`);
  }
}

async function closeFailedCleanupGuardian(guardian: CleanupGuardian, gateOpened: boolean, operationError: unknown) {
  let gateCleanupError: unknown;
  try {
    rmSync(guardian.gatePath, { force: true });
  } catch (error) {
    gateCleanupError = error;
  }

  const processGroup = guardian.child.pid ? new CleanupProcessGroup(guardian.child.pid) : undefined;
  if (processGroup?.isLive()) {
    if (gateOpened) {
      throw new CleanupFenceHeldError(
        `Local Convex cleanup guardian ${guardian.child.pid} still owns an active Docker cleanup process group`
      );
    }
    await processGroup.terminate();
  }
  if (gateCleanupError) {
    throw new AggregateError(
      [operationError, gateCleanupError],
      'Local Convex cleanup failed and could not remove its gate file'
    );
  }
}

async function runFencedComposeDown(claim: CleanupClaim, reservationDirectory: string, environment: NodeJS.ProcessEnv) {
  const guardian = startCleanupGuardian(claim, reservationDirectory, environment);
  let gateOpened = false;

  try {
    await openCleanupGuardian(guardian, claim, reservationDirectory);
    gateOpened = true;
    await requireCleanupGuardianSuccess(guardian);
  } catch (error) {
    await closeFailedCleanupGuardian(guardian, gateOpened, error);
    throw error;
  }
  rmSync(guardian.gatePath, { force: true });
}

async function reapAbandonedLocalDevelopmentInstances(
  baseEnvironment: NodeJS.ProcessEnv,
  reservationDirectory: string
) {
  const reservations = withReservationDatabase(reservationDirectory, listReservations);

  for (const reservation of reservations) {
    if (reservationIsLive(reservation)) {
      continue;
    }
    try {
      await stopLocalDevelopmentInstance(rowToInstance(reservation), reservationDirectory, baseEnvironment, true);
    } catch (error) {
      console.warn(
        `Could not clean abandoned local Convex instance ${reservation.instanceId}; its ports remain reserved: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
}

/** Claims the lease, stops its exact Compose project, verifies its ports, then releases it. */
export async function stopLocalDevelopmentInstance(
  instance: ReservedLocalDevelopmentInstance,
  reservationDirectory: string,
  baseEnvironment: NodeJS.ProcessEnv,
  onlyIfStale = false
): Promise<boolean> {
  const claim = claimLocalDevelopmentInstanceCleanup(instance, reservationDirectory, onlyIfStale);
  if (!claim) {
    return false;
  }
  const environment = commandEnvironment(baseEnvironment, localDevelopmentEnvironmentOverrides(claim.claimedInstance));
  try {
    const containerIds = projectContainerIds(claim.claimedInstance, environment);
    assertContainerOwnership(claim.previousReservation, claim.claimedInstance, containerIds, environment);
    await runFencedComposeDown(claim, reservationDirectory, environment);
    assertProjectResourcesRemoved(claim.claimedInstance, environment);
    assertReservedPortsAreFree(claim.previousReservation);
    completeLocalDevelopmentInstanceCleanup(claim, reservationDirectory);
    return true;
  } catch (error) {
    if (!(error instanceof CleanupFenceHeldError)) {
      restoreLocalDevelopmentInstanceCleanup(claim, reservationDirectory);
    }
    throw error;
  }
}

if (import.meta.main && process.argv[2] === 'cleanup-guardian') {
  runCleanupGuardian(process.argv.slice(3))
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
