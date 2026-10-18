import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { z } from 'zod';

const locationSchema = z.looseObject({
  physicalLocation: z
    .looseObject({
      artifactLocation: z.looseObject({ uri: z.string() }),
    })
    .optional(),
});
const reportSchema = z.looseObject({
  runs: z.array(
    z.looseObject({
      results: z.array(z.looseObject({ locations: z.array(locationSchema).optional() })).optional(),
    })
  ),
});

/** Keeps repository-wide Scorecard findings without inventing a source file or line for them. */
export function normalizeScorecardSarif(input: unknown) {
  const report = reportSchema.parse(input);
  for (const run of report.runs) {
    for (const result of run.results ?? []) {
      for (const location of result.locations ?? []) {
        const physical = location.physicalLocation;
        if (physical?.artifactLocation.uri !== 'no file associated with this alert') {
          continue;
        }
        physical.artifactLocation.uri = './';
        /* The upstream line-one placeholder is not a source coordinate. */
        delete physical.region;
        delete physical.contextRegion;
      }
    }
  }
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) {
    throw new Error('Expected input and output SARIF paths');
  }
  writeFileSync(
    output,
    `${JSON.stringify(normalizeScorecardSarif(JSON.parse(readFileSync(input, 'utf8'))), null, 2)}\n`
  );
}
