import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import type { Plugin, Rolldown } from 'vite-plus';

const DEFAULT_BYTES = 500_000;
const WEBGPU_BYTES = 1_120_000;
const DRACO_BYTES = 740_000;
const THREE_BUILD = /\/node_modules\/three\/build\/three\.(core|webgpu|tsl)\.js$/u;
const digest = (source: string | Uint8Array) => createHash('sha256').update(source).digest('hex');
const require = createRequire(import.meta.url);
const dracoDigests = new Set(
  ['draco_decoder.js', 'gltf/draco_decoder.js'].map((name) =>
    digest(readFileSync(require.resolve(`three/examples/jsm/libs/draco/${name}`)))
  )
);

type OutputFile = Rolldown.OutputChunk | Rolldown.OutputAsset;
type Budget = { limit: number; identity: string };
const defaultBudget: Budget = { limit: DEFAULT_BYTES, identity: 'browser JavaScript' };

function isThreeWebGpuChunk(file: Rolldown.OutputChunk): boolean {
  const modules = Object.keys(file.modules).map((id) => THREE_BUILD.exec(id)?.[1]);
  return modules.length === 3 && new Set(modules).size === 3 && modules.every((kind) => kind !== undefined);
}

function payloadBudget(file: OutputFile): Budget {
  if (file.type === 'chunk') {
    return isThreeWebGpuChunk(file)
      ? { limit: WEBGPU_BYTES, identity: 'Three WebGPU/core/TSL vendor modules' }
      : defaultBudget;
  }
  return dracoDigests.has(digest(file.source))
    ? { limit: DRACO_BYTES, identity: 'unchanged Three Draco decoder' }
    : defaultBudget;
}

function javascriptBytes(file: OutputFile): number {
  const source = file.type === 'chunk' ? file.code : file.source;
  return typeof source === 'string' ? Buffer.byteLength(source) : source.byteLength;
}

function inspectJavaScriptFile(file: OutputFile): string[] {
  const bytes = javascriptBytes(file);
  const { limit, identity } = payloadBudget(file);
  if (bytes > limit) {
    throw new Error(`${file.fileName}: ${bytes} bytes exceeds ${limit} bytes for ${identity}.`);
  }
  return limit === DEFAULT_BYTES ? [] : [`${file.fileName}: ${bytes}/${limit} bytes, ${identity}`];
}

/** Fail browser JavaScript growth; only verified Three vendor payloads have larger budgets. */
export function inspectBrowserJavaScript(bundle: Rolldown.OutputBundle): string[] {
  return Object.values(bundle)
    .filter((file) => /\.[cm]?js$/u.test(file.fileName))
    .flatMap(inspectJavaScriptFile);
}

export function browserBundleBudgets(): Plugin {
  return {
    name: 'dunezone:browser-bundle-budgets',
    apply: 'build',
    applyToEnvironment({ name, config, logger }) {
      if (name !== 'client') {
        return false;
      }
      if (config.build.minify === false) {
        logger.info('[bundle-budget] Skipping minified delivery budgets for this unminified client build.');
        return false;
      }
      return true;
    },
    enforce: 'post',
    generateBundle: {
      order: 'post',
      handler(_, bundle) {
        for (const report of inspectBrowserJavaScript(bundle)) {
          this.info(`[bundle-budget] ${report}`);
        }
      },
    },
  };
}
