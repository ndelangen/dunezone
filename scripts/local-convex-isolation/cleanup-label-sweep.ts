import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
  readLocalDevelopmentInstanceReservation,
  reserveLocalDevelopmentInstance,
  stopLocalDevelopmentInstance,
} from '../local-dev-reservation';
import type { ReservedLocalDevelopmentInstance } from '../local-dev-reservation';
import { commandEnvironment } from '../provision';
import { createTemporaryDirectory, invariant, rootDirectory } from './runtime';
import { topologyEnvironment } from './workers';

const resourceKinds = ['container', 'network', 'volume'] as const;

type CleanupLabelSweepFixture = {
  temporaryDirectory: string;
  reservationDirectory: string;
  fakeDockerPath: string;
};

type CleanupLabelSweepScenario = {
  environment: NodeJS.ProcessEnv;
  instance: ReservedLocalDevelopmentInstance;
  resourceIds: Record<(typeof resourceKinds)[number], string>;
  resourcePaths: Record<(typeof resourceKinds)[number], string>;
  stateDirectory: string;
  worktreePath: string;
};

function fakeDockerScript() {
  return [
    '#!/bin/bash',
    'set -euo pipefail',
    'state_dir="${CLEANUP_PROBE_DIRECTORY:?}"',
    'project_name="${COMPOSE_PROJECT_NAME:?}"',
    'project_filter="label=com.docker.compose.project=$project_name"',
    'printf "%s\\n" "$*" >> "$state_dir/docker.calls"',
    'resource_path() { printf "%s/%s.%s" "$state_dir" "$project_name" "$1"; }',
    'require_project_filter() {',
    '  if [[ "$*" != *"--filter $project_filter"* ]]; then',
    '    printf "unexpected project filter: %s\\n" "$*" >&2',
    '    exit 64',
    '  fi',
    '}',
    'if [[ "${1:-}" == "compose" ]]; then',
    '  exit 17',
    'fi',
    'if [[ "${1:-}" == "inspect" ]]; then',
    '  printf \'[{"Config":{"Labels":{"com.docker.compose.project":"%s","com.docker.compose.project.working_dir":"%s","com.docker.compose.project.config_files":"%s/docker-compose.convex-local.yml","com.docker.compose.service":"retired-service"}},"HostConfig":{"PortBindings":{}}}]\\n\' "$project_name" "$CLEANUP_WORKTREE_PATH" "$CLEANUP_WORKTREE_PATH"',
    '  exit 0',
    'fi',
    'if [[ "${1:-}" == "ps" ]]; then',
    '  require_project_filter "$@"',
    '  resource_file="$(resource_path container)"',
    '  if [[ -f "$resource_file" ]]; then cat "$resource_file"; fi',
    '  exit 0',
    'fi',
    'if [[ "${1:-}" == "network" && "${2:-}" == "ls" ]]; then',
    '  require_project_filter "$@"',
    '  resource_file="$(resource_path network)"',
    '  if [[ -f "$resource_file" ]]; then cat "$resource_file"; fi',
    '  exit 0',
    'fi',
    'if [[ "${1:-}" == "volume" && "${2:-}" == "ls" ]]; then',
    '  require_project_filter "$@"',
    '  resource_file="$(resource_path volume)"',
    '  if [[ -f "$resource_file" ]]; then cat "$resource_file"; fi',
    '  exit 0',
    'fi',
    'if [[ "${1:-}" == "container" && "${2:-}" == "rm" ]]; then',
    '  resource_file="$(resource_path container)"',
    '  [[ "${4:-}" == "$(cat "$resource_file")" ]]',
    '  rm -f "$resource_file"',
    '  exit 0',
    'fi',
    'if [[ "${1:-}" == "network" && "${2:-}" == "rm" ]]; then',
    '  resource_file="$(resource_path network)"',
    '  [[ "${3:-}" == "$(cat "$resource_file")" ]]',
    '  rm -f "$resource_file"',
    '  exit 0',
    'fi',
    'if [[ "${1:-}" == "volume" && "${2:-}" == "rm" ]]; then',
    '  resource_file="$(resource_path volume)"',
    '  [[ "${4:-}" == "$(cat "$resource_file")" ]]',
    '  if [[ "${CLEANUP_STICKY_VOLUME:-0}" == "1" ]]; then exit 23; fi',
    '  rm -f "$resource_file"',
    '  exit 0',
    'fi',
    'printf "unexpected Docker command: %s\\n" "$*" >&2',
    'exit 65',
    '',
  ].join('\n');
}

function createFixture(): CleanupLabelSweepFixture {
  const temporaryDirectory = createTemporaryDirectory('cleanup-label-sweep-');
  const fakeBinDirectory = path.join(temporaryDirectory, 'bin');
  const fakeDockerPath = path.join(fakeBinDirectory, 'docker');
  mkdirSync(fakeBinDirectory);
  writeFileSync(fakeDockerPath, fakeDockerScript());
  chmodSync(fakeDockerPath, 0o700);
  return {
    temporaryDirectory,
    reservationDirectory: path.join(temporaryDirectory, 'reservations'),
    fakeDockerPath,
  };
}

async function createScenario(
  fixture: CleanupLabelSweepFixture,
  options: { name: string; stickyVolume: boolean }
): Promise<CleanupLabelSweepScenario> {
  const stateDirectory = path.join(fixture.temporaryDirectory, options.name);
  const worktreePath = path.join(fixture.temporaryDirectory, 'deleted-worktrees', options.name, 'dunezone');
  mkdirSync(stateDirectory);
  const environment = commandEnvironment(topologyEnvironment(), {
    CLEANUP_PROBE_DIRECTORY: stateDirectory,
    CLEANUP_STICKY_VOLUME: options.stickyVolume ? '1' : undefined,
    CLEANUP_WORKTREE_PATH: worktreePath,
    LOCAL_DEV_DOCKER_PATH: fixture.fakeDockerPath,
    LOCAL_DEV_INSTANCE_ID: `cleanup-label-sweep-${options.name}`,
  });
  const instance = await reserveLocalDevelopmentInstance(worktreePath, environment, fixture.reservationDirectory);
  const resourcePaths = Object.fromEntries(
    resourceKinds.map((resource) => [resource, path.join(stateDirectory, `${instance.composeProjectName}.${resource}`)])
  ) as CleanupLabelSweepScenario['resourcePaths'];
  const resourceIds = Object.fromEntries(
    resourceKinds.map((resource) => [resource, `${instance.composeProjectName}-retired-${resource}`])
  ) as CleanupLabelSweepScenario['resourceIds'];
  for (const resource of resourceKinds) {
    writeFileSync(resourcePaths[resource], resourceIds[resource]);
    writeFileSync(path.join(stateDirectory, `foreign.${resource}`), `foreign-${resource}`);
  }
  return { environment, instance, resourceIds, resourcePaths, stateDirectory, worktreePath };
}

function assertResourcesWereSwept(scenario: CleanupLabelSweepScenario) {
  for (const resource of resourceKinds) {
    invariant(!existsSync(scenario.resourcePaths[resource]), `Cleanup left its ${resource} resource behind`);
    invariant(
      existsSync(path.join(scenario.stateDirectory, `foreign.${resource}`)),
      `Cleanup touched the foreign ${resource} fixture`
    );
  }
}

function assertRecoveryCommands(scenario: CleanupLabelSweepScenario) {
  const calls = readFileSync(path.join(scenario.stateDirectory, 'docker.calls'), 'utf8').trim().split('\n');
  const composeCall = calls.find((call) => call.startsWith('compose '));
  invariant(composeCall, 'Cleanup never attempted a graceful Compose teardown');
  invariant(
    composeCall.includes(path.join(rootDirectory, 'docker-compose.convex-local.yml')),
    'Deleted-worktree cleanup did not use the current Compose file'
  );
  invariant(
    !composeCall.includes(path.join(scenario.worktreePath, 'docker-compose.convex-local.yml')),
    'Deleted-worktree cleanup tried to use its missing Compose file'
  );
  const removalCalls = [
    `container rm --force ${scenario.resourceIds.container}`,
    `network rm ${scenario.resourceIds.network}`,
    `volume rm --force ${scenario.resourceIds.volume}`,
  ];
  const removalIndexes = removalCalls.map((call) => calls.indexOf(call));
  invariant(
    removalIndexes.every((index) => index >= 0),
    'Exact-label cleanup skipped a Docker resource kind'
  );
  invariant(
    removalIndexes[0] < removalIndexes[1] && removalIndexes[1] < removalIndexes[2],
    'Exact-label cleanup did not remove containers, networks, and volumes in order'
  );
  const expectedFilter = `--filter label=com.docker.compose.project=${scenario.instance.composeProjectName}`;
  invariant(
    calls.filter((call) => call.includes('--filter')).every((call) => call.includes(expectedFilter)),
    'Cleanup used a Docker resource query broader than the exact Compose project label'
  );
}

async function proveRecoveredSweep(fixture: CleanupLabelSweepFixture) {
  const scenario = await createScenario(fixture, { name: 'recovered', stickyVolume: false });
  invariant(
    await stopLocalDevelopmentInstance(scenario.instance, fixture.reservationDirectory, scenario.environment),
    'Exact-label cleanup did not recover the failed Compose teardown'
  );
  invariant(
    !readLocalDevelopmentInstanceReservation(scenario.worktreePath, scenario.environment, fixture.reservationDirectory),
    'Recovered cleanup left its reservation behind'
  );
  assertResourcesWereSwept(scenario);
  assertRecoveryCommands(scenario);
}

async function captureCleanupFailure(scenario: CleanupLabelSweepScenario, reservationDirectory: string) {
  try {
    await stopLocalDevelopmentInstance(scenario.instance, reservationDirectory, scenario.environment);
  } catch (error) {
    return error;
  }
  return undefined;
}

async function proveUnrecoveredSweep(fixture: CleanupLabelSweepFixture) {
  const scenario = await createScenario(fixture, { name: 'unrecovered', stickyVolume: true });
  const cleanupError = await captureCleanupFailure(scenario, fixture.reservationDirectory);
  invariant(cleanupError instanceof Error, 'Cleanup accepted a failed exact-label sweep');
  invariant(cleanupError.message.includes('exact project-label cleanup failed'), cleanupError.message);
  invariant(
    readLocalDevelopmentInstanceReservation(scenario.worktreePath, scenario.environment, fixture.reservationDirectory)
      ?.reservationToken === scenario.instance.reservationToken,
    'Failed exact-label cleanup did not restore the reservation'
  );
  invariant(existsSync(scenario.resourcePaths.volume), 'The sticky-volume fixture did not survive failed cleanup');
}

export async function proveCleanupLabelSweep() {
  const fixture = createFixture();
  try {
    await proveRecoveredSweep(fixture);
    await proveUnrecoveredSweep(fixture);
    console.log('Exact project-label cleanup recovers deleted-worktree and Compose config drift safely.');
  } finally {
    rmSync(fixture.temporaryDirectory, { recursive: true, force: true });
  }
}
