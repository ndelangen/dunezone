/*
 * Generates the e2e lcov report from the raw coverage cache the workers wrote via
 * e2e/coverage.ts. No-op unless E2E_COVERAGE=1.
 */
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import MCR from 'monocart-coverage-reports';

import { coverageEnabled, mcrOptions } from './coverage';

/*
 * mcrOptions.sourceFilter only sees entries monocart could unpack via sourcemap; built chunks
 * with no usable map (the TanStack shell virtual entry, CSS-module JS proxies with empty
 * mappings) pass through as raw dist paths. Codecov must only ever see repo paths, so the
 * invariant is enforced on the final report: drop every lcov record outside src/.
 */
async function dropNonSrcRecords(lcovPath: string): Promise<void> {
  if (!existsSync(lcovPath)) {
    // Nothing was generated; e.g. globalSetup failed before any test collected coverage.
    return;
  }
  const lcov = await readFile(lcovPath, 'utf8');
  const records = lcov.split('end_of_record\n');
  const kept = records.filter((record) => !record.includes('SF:') || record.includes('SF:src/'));
  await writeFile(lcovPath, kept.join('end_of_record\n'));
}

export default async function globalTeardown(): Promise<void> {
  if (!coverageEnabled) {
    return;
  }
  await MCR(mcrOptions).generate();
  await dropNonSrcRecords(join(mcrOptions.outputDir ?? 'coverage/e2e', 'lcov.info'));
}
