import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import WebSocket from 'ws';

function runtimePorts(parentPid) {
  assert.ok(Number.isSafeInteger(parentPid) && parentPid > 1);
  const rows = execFileSync('/bin/ps', ['-ax', '-o', 'pid=,ppid=,comm='], { encoding: 'utf8' })
    .trim()
    .split('\n')
    .map((line) => {
      const [pid, parent, ...command] = line.trim().split(/\s+/);
      return { pid: Number(pid), parent: Number(parent), command: command.join(' ') };
    });
  const owned = new Set([parentPid]);
  let size;
  do {
    size = owned.size;
    for (const row of rows) {
      if (owned.has(row.parent)) {
        owned.add(row.pid);
      }
    }
  } while (owned.size !== size);
  const runtimes = rows.filter((row) => owned.has(row.pid) && path.basename(row.command) === 'workerd');
  assert.ok(runtimes.length, 'No workerd process belongs to this local stack.');
  const lsof = ['/usr/sbin/lsof', '/usr/bin/lsof'].find((filename) => existsSync(filename));
  assert.ok(lsof, 'Local CPU profiling requires lsof.');
  const output = execFileSync(
    lsof,
    ['-nP', '-a', '-p', runtimes.map((row) => row.pid).join(','), '-iTCP', '-sTCP:LISTEN', '-Fn'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  );
  return [...new Set([...output.matchAll(/^n127\.0\.0\.1:(\d+)$/gm)].map((match) => Number(match[1])))];
}

async function targetsAt(port) {
  const origin = `http://127.0.0.1:${port}`;
  let list;
  try {
    const response = await fetch(`${origin}/json/list`, { signal: AbortSignal.timeout(1000), redirect: 'error' });
    list = await response.json();
  } catch {
    /* Other owned listeners are HTTP servers, not inspectors. */
    return [];
  }
  if (!Array.isArray(list)) {
    return [];
  }
  return list
    .filter((target) => /^core:user:dunezone-game-local-[a-f\d-]+$/.test(target.id))
    .map((target) => {
      const socket = new URL(target.webSocketDebuggerUrl);
      assert.equal(socket.origin, origin.replace('http:', 'ws:'));
      return { id: target.id, url: socket.href };
    });
}

async function gameTarget(parentPid) {
  const matches = [];
  for (const port of runtimePorts(parentPid)) {
    matches.push(...(await targetsAt(port)));
  }
  assert.equal(matches.length, 1, 'Exactly one game Worker must belong to this isolated stack.');
  return matches[0];
}

function connection(url) {
  const socket = new WebSocket(url, { maxPayload: 32 * 1024 * 1024, handshakeTimeout: 5000 });
  const pending = new Map();
  let sequence = 0;
  socket.on('error', () => {});
  socket.on('message', (data) => {
    const message = JSON.parse(data.toString());
    const request = pending.get(message.id);
    if (!request) {
      return;
    }
    clearTimeout(request.timer);
    pending.delete(message.id);
    if (message.error) {
      request.reject(new Error(message.error.message));
    } else {
      request.resolve(message.result);
    }
  });
  return {
    ready: new Promise((resolve, reject) => {
      socket.once('open', resolve);
      socket.once('error', reject);
    }),
    request(method) {
      const id = ++sequence;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`${method} timed out.`));
        }, 10_000);
        pending.set(id, { resolve, reject, timer });
        socket.send(JSON.stringify({ id, method, params: {} }));
      });
    },
    close() {
      socket.terminate();
    },
  };
}

/** Capture the owned game isolate through V8's sampling profiler without changing game handlers. */
export async function cpuProfile(parentPid, directory) {
  const target = await gameTarget(parentPid);
  const inspector = connection(target.url);
  try {
    await inspector.ready;
    await inspector.request('Profiler.enable');
    await inspector.request('Profiler.start');
  } catch (error) {
    inspector.close();
    throw error;
  }
  const started = performance.now();
  return {
    async finish() {
      try {
        const { profile } = await inspector.request('Profiler.stop');
        assert.ok(profile.nodes?.length && profile.samples?.length, 'The CPU profile contains no samples.');
        await writeFile(path.join(directory, 'game.cpuprofile'), JSON.stringify(profile), { flag: 'wx' });
        return { target: target.id, elapsedMs: performance.now() - started, ...summarize(profile) };
      } finally {
        inspector.close();
      }
    },
  };
}

export function summarize(profile) {
  const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
  const counts = new Map();
  for (const id of profile.samples) {
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const frames = [...counts].map(([id, samples]) => ({ ...nodes.get(id).callFrame, samples }));
  const gaps = [...profile.timeDeltas].sort((left, right) => left - right);
  return {
    samples: profile.samples.length,
    durationMs: (profile.endTime - profile.startTime) / 1000,
    medianSampleGapMs: gaps[Math.floor(gaps.length / 2)] / 1000,
    maxSampleGapMs: gaps.at(-1) / 1000,
    frames: frames.toSorted((left, right) => right.samples - left.samples),
    limitation:
      'Local V8 samples identify observed stack frames. Gaps include time while the isolate yields, so frame sample gaps are not attributed as CPU time. Debugger overhead remains; this is not a per-handler timer or hosted billing measurement.',
  };
}
