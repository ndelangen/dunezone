import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';

import type { Plugin, Rolldown } from 'vite-plus';

const DEFAULT_BYTES = 500_000;
const WEBGPU_BYTES = 1_120_000;
const DRACO_BYTES = 740_000;
const THREE_BUILD = /\/node_modules\/three\/build\/three\.(core|webgpu|tsl)\.js$/u;
const digest = (source: string | Uint8Array) => createHash('sha256').update(source).digest('hex');
const dracoDigests = new Set(
  ['draco_decoder.js', 'gltf/draco_decoder.js'].map((name) =>
    digest(readFileSync(new URL(`../examples/jsm/libs/draco/${name}`, import.meta.resolve('three'))))
  )
);

/** Fail browser JavaScript growth; only verified Three vendor payloads have larger budgets. */
export function inspectBrowserJavaScript(bundle: Rolldown.OutputBundle): string[] {
  const reports: string[] = [];
  for (const file of Object.values(bundle)) {
    if (!/\.(?:c|m)?js$/u.test(file.fileName)) {
      continue;
    }
    const source = file.type === 'chunk' ? file.code : file.source;
    const bytes = typeof source === 'string' ? Buffer.byteLength(source) : source.byteLength;
    let limit = DEFAULT_BYTES;
    let identity = 'browser JavaScript';
    if (file.type === 'chunk') {
      const modules = Object.keys(file.modules).map((id) => THREE_BUILD.exec(id)?.[1]);
      if (modules.length === 3 && new Set(modules).size === 3 && modules.every((kind) => kind !== undefined)) {
        limit = WEBGPU_BYTES;
        identity = 'Three WebGPU/core/TSL vendor modules';
      }
    } else if (dracoDigests.has(digest(source))) {
      limit = DRACO_BYTES;
      identity = 'unchanged Three Draco decoder';
    }
    if (bytes > limit) {
      throw new Error(`${file.fileName}: ${bytes} bytes exceeds ${limit} bytes for ${identity}.`);
    }
    if (limit !== DEFAULT_BYTES) {
      reports.push(`${file.fileName}: ${bytes}/${limit} bytes, ${identity}`);
    }
  }
  return reports;
}

export function browserBundleBudgets(): Plugin {
  return {
    name: 'dunezone:browser-bundle-budgets',
    apply: 'build',
    enforce: 'post',
    generateBundle: {
      order: 'post',
      handler(_, bundle) {
        if (this.environment.name === 'client') {
          for (const report of inspectBrowserJavaScript(bundle)) {
            this.info(`[bundle-budget] ${report}`);
          }
        }
      },
    },
  };
}
