import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, test } from 'vite-plus/test';

import { JOB_DIRECTORY, SNAPSHOT_FILE } from './anonymised-snapshot';

const workflow = readFileSync(path.resolve(process.cwd(), '.github/workflows/dev-rebuild.yml'), 'utf8');

/** The workflow's steps in order, each as the text of its list item. */
const steps = workflow.slice(workflow.indexOf('\n    steps:\n')).split('\n      - ').slice(1);

const stepNamed = (name: string) => steps.find((step) => step.startsWith(`name: ${name}\n`));

describe('dev rebuild workflow', () => {
  test('loads cloud dev from the snapshot it anonymised, and only that step holds the production key', () => {
    const anonymise = stepNamed('Export production, anonymise it and scan the snapshot');
    const rebuild = stepNamed('Rebuild dev from the anonymised snapshot');

    expect(steps.filter((step) => step.includes('secrets.CONVEX_DEPLOY_KEY'))).toEqual([anonymise]);
    expect(anonymise).toContain('run: bun run ./scripts/anonymised-snapshot.ts\n');
    expect(anonymise).toContain('CONVEX_PROD_DEPLOY_KEY: ${{ secrets.CONVEX_DEPLOY_KEY }}');
    expect(rebuild).toContain(
      `run: bun run provision dev --stage data --snapshot-file "\${RUNNER_TEMP}/${JOB_DIRECTORY}/${SNAPSHOT_FILE}"\n`
    );
    expect(steps.indexOf(rebuild!)).toBe(steps.indexOf(anonymise!) + 1);
    expect(steps.filter((step) => step.includes('--stage data'))).toEqual([rebuild]);
    expect(steps.at(-1)).toContain(`if: always()\n        run: rm -rf "\${RUNNER_TEMP:?}/${JOB_DIRECTORY}"\n`);
  });

  test('a migration-only merge pushes code, then migrates dev, and falls back to a fresh export when either step fails', () => {
    const push = stepNamed('Push main to the dev deployment');
    const migrate = stepNamed("Run the new migrations on dev's data");
    const data = stepNamed('Decide whether dev is rebuilt from a fresh export');

    expect(push).toContain("continue-on-error: ${{ steps.decision.outputs.migrate == 'true' }}\n");
    expect(migrate).toContain("if: steps.decision.outputs.migrate == 'true' && steps.push.outcome == 'success'\n");
    expect(migrate).toContain('continue-on-error: true\n');
    expect(migrate).toContain('run: bun run provision dev --stage migrate\n');
    expect(migrate).toContain('CONVEX_DEV_DEPLOY_KEY: ${{ secrets.CONVEX_DEV_DEPLOY_KEY }}');
    expect(steps.indexOf(migrate!)).toBe(steps.indexOf(push!) + 1);
    expect(data).toContain(
      "steps.decision.outputs.migrate == 'true' && (steps.push.outcome == 'failure' || steps.migrate.outcome == 'failure')"
    );
    for (const name of [
      'Export production, anonymise it and scan the snapshot',
      'Rebuild dev from the anonymised snapshot',
    ]) {
      expect(stepNamed(name)).toContain("if: steps.data.outputs.rebuild == 'true'\n");
    }
  });
});
