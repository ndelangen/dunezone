import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { transformSync } from '@babel/core';
import compiler from 'babel-plugin-react-compiler';
import type { Logger } from 'babel-plugin-react-compiler';
import { expect, test } from 'vite-plus/test';

import { compilerSourceFilter } from './reactCompiler';

test('the application compiler rollout has no skipped functions or diagnostics', () => {
  const app = resolve(import.meta.dirname, '../../src/app');
  const diagnostics: string[] = [];
  let compiled = 0;
  const logger: Logger = {
    logEvent(file, event) {
      if (event.kind === 'CompileSuccess') {
        compiled += 1;
      } else if (event.kind === 'CompileError' || event.kind === 'CompileDiagnostic') {
        diagnostics.push(`${file}:${event.fnLoc?.start.line ?? 0}: ${event.detail.reason}`);
      } else if (event.kind === 'CompileSkip') {
        diagnostics.push(`${file}:${event.fnLoc?.start.line ?? 0}: ${event.reason}`);
      } else if (event.kind === 'PipelineError') {
        diagnostics.push(`${file}: ${event.data}`);
      }
    },
  };
  for (const path of readdirSync(app, { recursive: true })) {
    const filename = resolve(app, String(path));
    if (!/\.[jt]sx?$/.test(filename) || !compilerSourceFilter.include.test(filename)) {
      continue;
    }
    if (compilerSourceFilter.exclude.some((pattern) => pattern.test(filename))) {
      continue;
    }
    transformSync(readFileSync(filename, 'utf8'), {
      filename,
      babelrc: false,
      configFile: false,
      parserOpts: { plugins: ['typescript', 'jsx'] },
      plugins: [[compiler, { target: '19', logger }]],
    });
  }
  expect(diagnostics).toEqual([]);
  expect(compiled).toBeGreaterThan(1000);
}, 30_000);
