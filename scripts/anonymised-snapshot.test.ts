import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, test } from 'vite-plus/test';
import { parse } from 'yaml';

import { JOB_DIRECTORY, jobEnvironment, SNAPSHOT_FILE, summaryMarkdown } from './anonymised-snapshot';

interface Step {
  name?: string;
  if?: string;
  uses?: string;
  run?: string;
  with?: Record<string, string | number>;
  env?: Record<string, string>;
}

const workflowSource = readFileSync(path.resolve(process.cwd(), '.github/workflows/anonymised-snapshot.yml'), 'utf8');
const workflow = parse(workflowSource) as {
  on: { schedule: { cron: string }[] } & Record<string, unknown>;
  env: Record<string, string>;
  jobs: { snapshot: { if: string; environment: string; steps: Step[] } };
};

const job = workflow.jobs.snapshot;
const steps = job.steps;

const stepNamed = (name: string) => steps.findIndex((step) => step.name === name);

const actionsEnvironment = {
  GITHUB_ACTIONS: 'true',
  GITHUB_REF: 'refs/heads/main',
  CONVEX_PROD_DEPLOY_KEY: 'not-a-real-key',
  RUNNER_TEMP: '/runner/temp',
  GITHUB_STEP_SUMMARY: '/runner/summary.md',
};

describe('anonymised snapshot job', () => {
  test('runs from main in the production environment, by hand or at most once a week', () => {
    expect(Object.keys(workflow.on)).toEqual(['schedule', 'workflow_dispatch']);
    const crons = workflow.on.schedule.map(({ cron }) => cron.split(' '));
    expect(crons).toHaveLength(1);
    expect(crons[0]!.slice(0, 2)).toEqual([expect.stringMatching(/^\d+$/), expect.stringMatching(/^\d+$/)]);
    expect(crons[0]!.slice(2)).toEqual(['*', '*', '1']);
    expect(job).toMatchObject({ if: "github.ref == 'refs/heads/main'", environment: 'production' });
    expect(JSON.stringify(workflow).match(/secrets\./g)).toHaveLength(1);
    expect(steps[stepNamed('Export production, anonymise it and scan the snapshot')]?.env).toEqual({
      CONVEX_PROD_DEPLOY_KEY: '${{ secrets.CONVEX_DEPLOY_KEY }}',
    });
  });

  test('uploads only the snapshot file, only when SNAPSHOT_UPLOAD is on, and always deletes the job directory', () => {
    expect(['false', 'true']).toContain(workflow.env.SNAPSHOT_UPLOAD);
    const upload = stepNamed('Upload the anonymised snapshot');
    const cleanup = stepNamed('Delete the export and the snapshot from the runner');
    expect(steps.filter((step) => step.uses?.startsWith('actions/upload-artifact@'))).toEqual([steps[upload]]);
    expect(steps[upload]).toMatchObject({
      if: "success() && env.SNAPSHOT_UPLOAD == 'true'",
      with: { path: `\${{ runner.temp }}/${JOB_DIRECTORY}/${SNAPSHOT_FILE}`, 'retention-days': 8 },
    });
    expect(cleanup).toBe(steps.length - 1);
    expect(steps[cleanup]).toMatchObject({ if: 'always()', run: `rm -rf "\${RUNNER_TEMP:?}/${JOB_DIRECTORY}"` });
  });

  test('refuses to start outside a GitHub Actions run on main that holds the deploy key', () => {
    expect(jobEnvironment(actionsEnvironment).directory).toBe(`/runner/temp/${JOB_DIRECTORY}`);
    expect(() => jobEnvironment({ ...actionsEnvironment, GITHUB_ACTIONS: undefined })).toThrow(/GitHub Actions/);
    expect(() => jobEnvironment({ ...actionsEnvironment, GITHUB_REF: 'refs/pull/1/merge' })).toThrow(/main/);
    expect(() => jobEnvironment({ ...actionsEnvironment, CONVEX_PROD_DEPLOY_KEY: '' })).toThrow(/DEPLOY_KEY/);
  });

  test('summarises tables, counts and field names without a value', () => {
    const snapshot = new Map([
      ['_tables/documents.jsonl', '{"name":"factions","id":1}\n'],
      ['factions/documents.jsonl', '{"_id":"a","_creationTime":1,"slug":"planted-slug","data":{"name":"Planted"}}\n'],
    ]);
    const report = {
      tables: [
        { table: 'factions', dropReason: null, rowsIn: 2, rowsOut: 1, droppedFields: [] },
        { table: 'authAccounts', dropReason: 'sign-in accounts', rowsIn: 3, rowsOut: 0, droppedFields: [] },
      ],
      droppedComponents: [{ component: 'statistics', dropReason: 'derived counts' }],
    };
    const written = summaryMarkdown({ kind: 'written', report, snapshot }, false);
    expect(written).toContain('Upload: off.');
    expect(written).toContain('Leak scan: no findings');
    expect(written).toContain('| `factions` | kept | 2 | 1 | `data`, `slug` |');
    expect(written).toContain('| `authAccounts` | dropped: sign-in accounts | 3 | 0 |  |');
    expect(written).toContain('Component data dropped:\n\n- `statistics`: derived counts\n');
    expect(written).not.toMatch(/Planted|planted-slug/);
    const refused = summaryMarkdown(
      {
        kind: 'refused',
        problems: ['leak scan: email in factions.data', 'unexpected entries:\n  - a/b.txt\n  - c/d.txt'],
      },
      false
    );
    expect(refused).toContain('- leak scan: email in factions.data\n');
    expect(refused).toContain('- unexpected entries:\n  - a/b.txt\n  - c/d.txt\n');
  });
});
