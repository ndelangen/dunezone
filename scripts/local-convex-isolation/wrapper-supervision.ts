import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { commandEnvironment } from '../provision';
import {
  createTemporaryDirectory,
  invariant,
  processGroupIsAlive,
  rootDirectory,
  waitForExit,
  waitForFile,
} from './runtime';

type WrapperSupervisorScenario = {
  name: string;
  target: 'worker' | 'wrapper' | 'worker-success';
  signal: NodeJS.Signals;
  expectedExitCode: number;
  expectsChildExit: boolean;
  expectsWorkerExit: boolean;
  interruptCleanup?: boolean;
  cleanupExitCode?: number;
  stubbornChild?: boolean;
};

type WrapperProbe = {
  scenario: WrapperSupervisorScenario;
  temporaryDirectory: string;
  fakeBinDirectory: string;
  workerReadyPath: string;
  cleanupReadyPath: string;
  eventsPath: string;
  wrapper?: ChildProcess;
  workerPid?: number;
  workerProcessGroupId?: number;
};

type WrapperObservation = {
  exitCode: number | null;
  events: string[];
  appTemporaryDirectory: string;
};

const scenarios: WrapperSupervisorScenario[] = [
  {
    name: 'targeted-term',
    target: 'wrapper',
    signal: 'SIGTERM',
    expectedExitCode: 143,
    expectsChildExit: true,
    expectsWorkerExit: true,
  },
  {
    name: 'targeted-int',
    target: 'wrapper',
    signal: 'SIGINT',
    expectedExitCode: 130,
    expectsChildExit: true,
    expectsWorkerExit: true,
  },
  {
    name: 'stubborn-child-term',
    target: 'wrapper',
    signal: 'SIGTERM',
    expectedExitCode: 143,
    expectsChildExit: false,
    expectsWorkerExit: false,
    stubbornChild: true,
  },
  {
    name: 'worker-kill',
    target: 'worker',
    signal: 'SIGKILL',
    expectedExitCode: 137,
    expectsChildExit: true,
    expectsWorkerExit: false,
  },
  {
    name: 'cleanup-term',
    target: 'worker',
    signal: 'SIGKILL',
    expectedExitCode: 137,
    expectsChildExit: true,
    expectsWorkerExit: false,
    interruptCleanup: true,
  },
  {
    name: 'cleanup-failure',
    target: 'worker-success',
    signal: 'SIGTERM',
    expectedExitCode: 73,
    expectsChildExit: true,
    expectsWorkerExit: true,
    cleanupExitCode: 73,
  },
];

/** A finite cleanup delay exposes a second shutdown signal before the first one has drained. */
function childScript() {
  return [
    '#!/bin/bash',
    'set -euo pipefail',
    'STATE_DIR="${WRAPPER_PROBE_DIRECTORY:?}"',
    'stop_child() {',
    '  trap - INT TERM',
    '  sleep 0.1',
    '  printf "child-exit\\n" >> "$STATE_DIR/events"',
    '  exit 0',
    '}',
    'if [[ "${WRAPPER_PROBE_STUBBORN_CHILD:-}" == "true" ]]; then',
    "  trap '' INT TERM",
    'else',
    "  trap 'stop_child' INT TERM",
    'fi',
    'printf "%s\\n" "$$" > "$STATE_DIR/child.pid"',
    ': > "$STATE_DIR/child.ready"',
    'while true; do sleep 1; done',
    '',
  ].join('\n');
}

/** A Bash background child ignores INT, so the worker's INT handler must also terminate it. */
function bunScript() {
  return [
    '#!/bin/bash',
    'set -euo pipefail',
    'STATE_DIR="${WRAPPER_PROBE_DIRECTORY:?}"',
    'case "${1:-}" in',
    '  */scripts/app-dev.ts)',
    '    : > "$STATE_DIR/events"',
    '    printf "%s\\n" "${LOCAL_DEV_TEMPORARY_DIRECTORY:?}" > "$STATE_DIR/app-temp-directory"',
    '    : > "$LOCAL_DEV_TEMPORARY_DIRECTORY/prod-snapshot.zip"',
    '    printf "%s\\n" "$$" > "$STATE_DIR/worker.pid"',
    '    ps -p "$$" -o pgid= | tr -d " " > "$STATE_DIR/worker.pgid"',
    '    "$STATE_DIR/fake-child.sh" &',
    '    CHILD_PID=$!',
    '    stop_worker() {',
    '      local exit_code="$1"',
    '      trap - INT TERM',
    '      sleep 0.1',
    '      if [[ "$exit_code" == "130" ]]; then',
    '        kill -s TERM "$CHILD_PID" 2>/dev/null || true',
    '      fi',
    '      wait "$CHILD_PID" 2>/dev/null || true',
    '      printf "worker-exit\\n" >> "$STATE_DIR/events"',
    '      exit "$exit_code"',
    '    }',
    "    trap 'stop_worker 130' INT",
    "    trap 'stop_worker 143' TERM",
    '    while [[ ! -f "$STATE_DIR/child.ready" ]]; do sleep 0.01; done',
    '    : > "$STATE_DIR/worker.ready"',
    '    if [[ "${WRAPPER_PROBE_WORKER_SUCCEEDS:-}" == "true" ]]; then',
    '      kill -s TERM "$CHILD_PID"',
    '      stop_worker 0',
    '    fi',
    '    while true; do sleep 1; done',
    '    ;;',
    '  */scripts/local-dev-cleanup.ts)',
    '    WORKER_PGID="$(tr -d " " < "$STATE_DIR/worker.pgid")"',
    '    if kill -0 -- "-$WORKER_PGID" 2>/dev/null; then',
    '      printf "cleanup-while-worker-group-live\\n" >> "$STATE_DIR/events"',
    '    else',
    '      printf "cleanup-after-worker-group-drained\\n" >> "$STATE_DIR/events"',
    '    fi',
    '    if [[ "${WRAPPER_PROBE_INTERRUPT_CLEANUP:-}" == "true" ]]; then',
    '      stop_cleanup() {',
    '        trap - INT TERM',
    '        printf "cleanup-signal\\n" >> "$STATE_DIR/events"',
    '        : > "$STATE_DIR/cleanup.ready"',
    '        exit 0',
    '      }',
    "      trap 'stop_cleanup' INT TERM",
    '      printf "%s\\n" "$$" > "$STATE_DIR/cleanup.pid"',
    '      : > "$STATE_DIR/cleanup.started"',
    '      while true; do sleep 1; done',
    '    else',
    '      if [[ -n "${WRAPPER_PROBE_CLEANUP_EXIT_CODE:-}" ]]; then',
    '        printf "cleanup-failure\\n" >&2',
    '        : > "$STATE_DIR/cleanup.ready"',
    '        exit "$WRAPPER_PROBE_CLEANUP_EXIT_CODE"',
    '      fi',
    '      : > "$STATE_DIR/cleanup.ready"',
    '    fi',
    '    ;;',
    '  *)',
    '    exit 64',
    '    ;;',
    'esac',
    '',
  ].join('\n');
}

function installProbeScripts(probe: WrapperProbe) {
  mkdirSync(probe.fakeBinDirectory);
  const fakeChildPath = path.join(probe.temporaryDirectory, 'fake-child.sh');
  const fakeBunPath = path.join(probe.fakeBinDirectory, 'bun');
  writeFileSync(fakeChildPath, childScript());
  writeFileSync(fakeBunPath, bunScript());
  chmodSync(fakeChildPath, 0o700);
  chmodSync(fakeBunPath, 0o700);
}

function createWrapperProbe(scenario: WrapperSupervisorScenario): WrapperProbe {
  const temporaryDirectory = createTemporaryDirectory(`wrapper-${scenario.name}-`);
  const probe = {
    scenario,
    temporaryDirectory,
    fakeBinDirectory: path.join(temporaryDirectory, 'bin'),
    workerReadyPath: path.join(temporaryDirectory, 'worker.ready'),
    cleanupReadyPath: path.join(temporaryDirectory, 'cleanup.ready'),
    eventsPath: path.join(temporaryDirectory, 'events'),
  };
  installProbeScripts(probe);
  return probe;
}

function readOptionalPositiveInteger(filePath: string) {
  const value = Number(readFileSync(filePath, 'utf8').trim());
  return Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

function readPositiveInteger(filePath: string, message: string) {
  const value = readOptionalPositiveInteger(filePath);
  invariant(value !== undefined, message);
  return value;
}

async function startWrapperProbe(probe: WrapperProbe) {
  const { scenario, temporaryDirectory } = probe;
  probe.wrapper = spawn('/bin/bash', [path.join(rootDirectory, 'scripts', 'app-dev.sh'), '--local'], {
    cwd: rootDirectory,
    env: commandEnvironment(process.env, {
      PATH: `${probe.fakeBinDirectory}:${process.env.PATH ?? ''}`,
      WRAPPER_PROBE_DIRECTORY: temporaryDirectory,
      WRAPPER_PROBE_CLEANUP_EXIT_CODE: scenario.cleanupExitCode ? String(scenario.cleanupExitCode) : undefined,
      WRAPPER_PROBE_INTERRUPT_CLEANUP: scenario.interruptCleanup ? 'true' : undefined,
      WRAPPER_PROBE_STUBBORN_CHILD: scenario.stubbornChild ? 'true' : undefined,
      WRAPPER_PROBE_WORKER_SUCCEEDS: scenario.target === 'worker-success' ? 'true' : undefined,
    }),
    stdio: 'inherit',
  });
  await waitForFile(probe.workerReadyPath);
  probe.workerPid = readPositiveInteger(
    path.join(temporaryDirectory, 'worker.pid'),
    'The wrapper probe did not record a worker PID'
  );
  probe.workerProcessGroupId = readPositiveInteger(
    path.join(temporaryDirectory, 'worker.pgid'),
    'The wrapper probe did not record a worker process group'
  );
}

async function driveWrapperProbe(probe: WrapperProbe) {
  invariant(probe.wrapper && probe.workerPid, 'The wrapper probe was not started');
  if (probe.scenario.target === 'wrapper') {
    probe.wrapper.kill(probe.scenario.signal);
  }
  if (probe.scenario.target === 'worker') {
    process.kill(probe.workerPid, probe.scenario.signal);
  }
  if (probe.scenario.interruptCleanup) {
    await waitForFile(path.join(probe.temporaryDirectory, 'cleanup.started'), 20_000);
    const cleanupPid = readPositiveInteger(
      path.join(probe.temporaryDirectory, 'cleanup.pid'),
      'The wrapper probe did not record a cleanup PID'
    );
    process.kill(cleanupPid, 'SIGTERM');
  }
}

async function observeWrapperProbe(probe: WrapperProbe): Promise<WrapperObservation> {
  invariant(probe.wrapper, 'The wrapper probe was not started');
  const exitCode = await waitForExit(probe.wrapper);
  await waitForFile(probe.cleanupReadyPath, 20_000);
  return {
    exitCode,
    events: readFileSync(probe.eventsPath, 'utf8').trim().split('\n'),
    appTemporaryDirectory: readFileSync(path.join(probe.temporaryDirectory, 'app-temp-directory'), 'utf8').trim(),
  };
}

function assertExitOrdering(scenario: WrapperSupervisorScenario, events: string[], cleanupIndex: number) {
  if (scenario.expectsChildExit) {
    invariant(
      events.indexOf('child-exit') < cleanupIndex,
      `${scenario.name} cleaned up before the worker child exited`
    );
  }
  if (scenario.expectsWorkerExit) {
    invariant(events.indexOf('worker-exit') < cleanupIndex, `${scenario.name} cleaned up before the worker exited`);
  }
}

function assertWrapperObservation(probe: WrapperProbe, observation: WrapperObservation) {
  const { scenario } = probe;
  const { events } = observation;
  invariant(
    observation.exitCode === scenario.expectedExitCode,
    `${scenario.name} wrapper exited ${String(observation.exitCode)} instead of ${scenario.expectedExitCode}`
  );
  invariant(
    events.includes('child-exit') === scenario.expectsChildExit,
    `${scenario.name} produced an unexpected child exit path`
  );
  invariant(
    events.includes('cleanup-after-worker-group-drained'),
    `${scenario.name} invoked fallback cleanup before draining the worker group`
  );
  invariant(
    !events.includes('cleanup-while-worker-group-live'),
    `${scenario.name} observed a live worker group during fallback cleanup`
  );
  const cleanupIndex = events.indexOf('cleanup-after-worker-group-drained');
  assertExitOrdering(scenario, events, cleanupIndex);
  invariant(
    events.includes('worker-exit') === scenario.expectsWorkerExit,
    `${scenario.name} produced an unexpected worker exit path`
  );
  invariant(
    events.includes('cleanup-signal') === Boolean(scenario.interruptCleanup),
    `${scenario.name} produced an unexpected cleanup signal path`
  );
  invariant(
    probe.workerProcessGroupId && !processGroupIsAlive(probe.workerProcessGroupId),
    `${scenario.name} left the worker process group alive`
  );
  invariant(
    !existsSync(observation.appTemporaryDirectory),
    `${scenario.name} retained its production snapshot directory`
  );
}

function recoverProcessGroupId(probe: WrapperProbe) {
  const processGroupPath = path.join(probe.temporaryDirectory, 'worker.pgid');
  if (!probe.workerProcessGroupId && existsSync(processGroupPath)) {
    probe.workerProcessGroupId = readOptionalPositiveInteger(processGroupPath);
  }
}

function disposeWrapperProbe(probe: WrapperProbe) {
  recoverProcessGroupId(probe);
  if (probe.wrapper?.exitCode === null) {
    probe.wrapper.kill('SIGKILL');
  }
  if (probe.workerProcessGroupId && processGroupIsAlive(probe.workerProcessGroupId)) {
    process.kill(-probe.workerProcessGroupId, 'SIGKILL');
  }
  rmSync(probe.temporaryDirectory, { recursive: true, force: true });
}

async function runWrapperSupervisorScenario(scenario: WrapperSupervisorScenario) {
  const probe = createWrapperProbe(scenario);
  try {
    await startWrapperProbe(probe);
    await driveWrapperProbe(probe);
    assertWrapperObservation(probe, await observeWrapperProbe(probe));
  } finally {
    disposeWrapperProbe(probe);
  }
}

export async function proveWrapperSupervision() {
  for (const scenario of scenarios) {
    await runWrapperSupervisorScenario(scenario);
  }
  console.log('The local app wrapper waits for its worker and drains the worker process group before cleanup.');
}
