import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, test } from 'vite-plus/test';
import { parse } from 'yaml';

interface Step {
  name?: string;
  run?: string;
  env?: Record<string, string>;
  'continue-on-error'?: unknown;
}

type Workflow = {
  on: Record<string, unknown>;
  concurrency: { group: string; 'cancel-in-progress': boolean };
  jobs: Record<string, { steps?: Step[]; uses?: string; secrets?: Record<string, string>; with?: unknown }>;
};

function workflow(file: string): Workflow {
  return parse(readFileSync(path.resolve(process.cwd(), '.github/workflows', file), 'utf8'));
}

describe('cloud dev sync', () => {
  test('ordinary releases preserve data and migration progress even when a command fails', () => {
    const sync = workflow('dev-rebuild.yml');
    const steps = sync.jobs.rebuild!.steps!;
    expect(steps.filter((step) => step.run)).toEqual([
      {
        name: 'Sync code and outstanding migrations without resetting dev',
        run: 'bun run provision dev --stage code --stage migrate',
        env: { CONVEX_DEV_DEPLOY_KEY: '${{ secrets.CONVEX_DEV_DEPLOY_KEY }}' },
      },
    ]);
    expect(steps.every((step) => !step['continue-on-error'])).toBe(true);
    expect(JSON.stringify(sync)).not.toMatch(
      /CONVEX_PROD_DEPLOY_KEY|secrets\.CONVEX_DEPLOY_KEY|--stage data|snapshot-file/
    );
  });

  test('release sync and weekly refresh cannot overlap', () => {
    const sync = workflow('dev-rebuild.yml');
    const snapshot = workflow('anonymised-snapshot.yml');
    expect(sync.concurrency).toEqual({ group: 'dev-rebuild', 'cancel-in-progress': false });
    expect(snapshot.concurrency).toEqual(sync.concurrency);
    const release = workflow('deploy-main.yml').jobs.dev_rebuild!;
    expect(release.secrets).toEqual({ CONVEX_DEV_DEPLOY_KEY: '${{ secrets.CONVEX_DEV_DEPLOY_KEY }}' });
    expect(release.with).toBeUndefined();
  });
});
