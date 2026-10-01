/*
 * Throwaway diagnostic for #1493, never merged.
 * Every second: the machine's CPU busy share over the last second and the one-minute load.
 * Every third second: one Lucia Scrypt verify (the code Convex Auth's Password runs in auth:store) timed in this Node process.
 * Every fifth sample: the top processes by CPU, for attribution.
 * One JSON line per sample on stdout.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const store = path.join(root, 'node_modules/.bun');
const lucia = readdirSync(store).find((name) => name.startsWith('lucia@'));
const { Scrypt } = await import(pathToFileURL(path.join(store, lucia, 'node_modules/lucia/dist/crypto.js')).href);
const password = 'measure-1493-password-0123456789abcdef';
const hash = await new Scrypt().hash(password);

function times() {
  return os.cpus().map(({ times: t }) => t);
}

function topProcesses() {
  try {
    const output =
      process.platform === 'darwin'
        ? execFileSync('/bin/ps', ['-Ao', 'pid,pcpu,rss,comm', '-r'], { encoding: 'utf8', timeout: 2000 })
        : execFileSync('/bin/ps', ['-eo', 'pid,pcpu,rss,comm', '--sort=-pcpu'], { encoding: 'utf8', timeout: 2000 });
    return output
      .split('\n')
      .slice(1, 9)
      .map((line) => line.trim().replace(/\s+/g, ' ').slice(0, 140));
  } catch (error) {
    return [`ps failed: ${error.message}`];
  }
}

let previous = times();
let tick = 0;
async function sample() {
  const current = times();
  let busy = 0;
  let total = 0;
  current.forEach((now, index) => {
    const before = previous[index];
    const delta = (key) => now[key] - before[key];
    const all = delta('user') + delta('nice') + delta('sys') + delta('idle') + delta('irq');
    total += all;
    busy += all - delta('idle');
  });
  previous = current;
  const entry = {
    t: Date.now(),
    cores: current.length,
    busy: total > 0 ? Math.round((busy / total) * 1000) / 1000 : null,
    load1: Math.round(os.loadavg()[0] * 100) / 100,
  };
  if (tick % 3 === 0) {
    const started = performance.now();
    const ok = await new Scrypt().verify(hash, password);
    entry.scryptMs = Math.round(performance.now() - started);
    entry.scryptOk = ok;
  }
  if (tick % 5 === 0) {
    entry.top = topProcesses();
  }
  tick += 1;
  console.log(JSON.stringify(entry));
  setTimeout(sample, 1000);
}
console.log(JSON.stringify({ t: Date.now(), start: true, platform: process.platform, cpus: os.cpus().map((cpu) => cpu.model), totalMem: os.totalmem(), node: process.version }));
setTimeout(sample, 1000);
