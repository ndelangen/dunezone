// Generates the e2e lcov report from the raw coverage cache the workers
// wrote via e2e/coverage.ts. No-op unless E2E_COVERAGE=1.
import MCR from 'monocart-coverage-reports';

import { coverageEnabled, mcrOptions } from './coverage';

export default async function globalTeardown(): Promise<void> {
  if (!coverageEnabled) {
    return;
  }
  await MCR(mcrOptions).generate();
}
