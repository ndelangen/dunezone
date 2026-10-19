import { readFileSync, readdirSync } from 'node:fs';
import { relative, resolve } from 'node:path';

import { transformSync } from '@babel/core';
import compiler from 'babel-plugin-react-compiler';
import type { Logger } from 'babel-plugin-react-compiler';

import { compilerSourceFilter } from './lib/reactCompiler.ts';

export function auditReactCompiler(sources: Iterable<{ filename: string; source: string }>) {
  const diagnostics: string[] = [];
  let compiled = 0;
  const logger: Logger = {
    logEvent(filename, event) {
      const file = filename ? relative(process.cwd(), filename) : '<unknown>';
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
  for (const { filename, source } of sources) {
    transformSync(source, {
      filename,
      babelrc: false,
      configFile: false,
      parserOpts: { plugins: ['typescript', 'jsx'] },
      plugins: [[compiler, { target: '19', logger }]],
    });
  }
  return { compiled, diagnostics };
}

function* applicationSources(app: string) {
  for (const path of readdirSync(app, { recursive: true })) {
    const filename = resolve(app, String(path));
    if (!/\.[jt]sx?$/.test(filename) || !compilerSourceFilter.include.test(filename)) {
      continue;
    }
    if (compilerSourceFilter.exclude.some((pattern) => pattern.test(filename))) {
      continue;
    }
    yield { filename, source: readFileSync(filename, 'utf8') };
  }
}

if (import.meta.main) {
  const started = performance.now();
  const root = resolve(import.meta.dirname, '../src/app');
  const { compiled, diagnostics } = auditReactCompiler(applicationSources(root));
  for (const diagnostic of diagnostics) {
    console.error(`[react-compiler] ${diagnostic}`);
  }
  console.info(
    `React Compiler: ${compiled} functions compiled, ${diagnostics.length} diagnostics, ${((performance.now() - started) / 1000).toFixed(2)}s.`
  );
  if (diagnostics.length > 0 || compiled === 0) {
    process.exitCode = 1;
  }
}
