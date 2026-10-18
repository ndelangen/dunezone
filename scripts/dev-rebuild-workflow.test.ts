import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, test } from 'vite-plus/test';
import { parse } from 'yaml';

import { JOB_DIRECTORY, SNAPSHOT_FILE } from './anonymised-snapshot';

interface Step {
  name?: string;
  id?: string;
  if?: string;
  'continue-on-error'?: boolean | string;
  run?: string;
  env?: Record<string, string>;
}

const workflow = parse(readFileSync(path.resolve(process.cwd(), '.github/workflows/dev-rebuild.yml'), 'utf8')) as {
  jobs: { rebuild: { 'timeout-minutes': number; steps: Step[] } };
};

const job = workflow.jobs.rebuild;
const steps = job.steps;

const stepNamed = (name: string) => steps.find((step) => step.name === name);

const holdsProductionKey = (step: Step) =>
  Object.values(step.env ?? {}).some((value) => value.includes('secrets.CONVEX_DEPLOY_KEY'));

describe('dev rebuild workflow', () => {
  test('loads cloud dev from the snapshot it anonymised, and only that step holds the production key', () => {
    const anonymise = stepNamed('Export production, anonymise it and scan the snapshot');
    const rebuild = stepNamed('Rebuild dev from the anonymised snapshot');

    expect(steps.filter(holdsProductionKey)).toEqual([anonymise]);
    expect(anonymise?.run).toBe('bun run ./scripts/anonymised-snapshot.ts');
    expect(anonymise?.env).toEqual({ CONVEX_PROD_DEPLOY_KEY: '${{ secrets.CONVEX_DEPLOY_KEY }}' });
    expect(rebuild?.run).toBe(
      `bun run provision dev --stage data --snapshot-file "\${RUNNER_TEMP}/${JOB_DIRECTORY}/${SNAPSHOT_FILE}"`
    );
    expect(steps.indexOf(rebuild!)).toBe(steps.indexOf(anonymise!) + 1);
    expect(steps.filter((step) => step.run?.includes('--stage data'))).toEqual([rebuild]);
    expect(steps.at(-1)).toMatchObject({ if: 'always()', run: `rm -rf "\${RUNNER_TEMP:?}/${JOB_DIRECTORY}"` });
  });

  test('a migration-only merge pushes code, then migrates dev, and falls back to a fresh export when either step fails', () => {
    const push = stepNamed('Push main to the dev deployment');
    const migrate = stepNamed("Run the new migrations on dev's data");
    const data = stepNamed('Decide whether dev is rebuilt from a fresh export');

    expect(push).toMatchObject({ id: 'push', 'continue-on-error': "${{ steps.decision.outputs.migrate == 'true' }}" });
    expect(migrate).toMatchObject({
      id: 'migrate',
      if: "steps.decision.outputs.migrate == 'true' && steps.push.outcome == 'success'",
      'continue-on-error': true,
      run: 'bun run provision dev --stage migrate',
      env: { CONVEX_DEV_DEPLOY_KEY: '${{ secrets.CONVEX_DEV_DEPLOY_KEY }}' },
    });
    expect(steps.indexOf(migrate!)).toBe(steps.indexOf(push!) + 1);
    expect(data?.env?.REBUILD).toBe(
      "${{ steps.decision.outputs.rebuild == 'true' || (steps.decision.outputs.migrate == 'true' && (steps.push.outcome == 'failure' || steps.migrate.outcome == 'failure')) }}"
    );
    for (const name of [
      'Export production, anonymise it and scan the snapshot',
      'Rebuild dev from the anonymised snapshot',
    ]) {
      expect(stepNamed(name)?.if).toBe("steps.data.outputs.rebuild == 'true'");
    }
  });

  test('a stalled migration stops in time for the fallback export and rebuild to finish inside the job', () => {
    const migrate = stepNamed("Run the new migrations on dev's data") as Step & { 'timeout-minutes'?: number };

    expect(migrate['timeout-minutes']).toBeGreaterThan(0);
    expect(job['timeout-minutes'] - migrate['timeout-minutes']!).toBeGreaterThanOrEqual(15);
  });
});
