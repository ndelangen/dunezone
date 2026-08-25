import preview from '@sb/preview';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';

import { db, useStorybookDatabaseClient, useStorybookDatabaseReset } from '@db/storybook';

import { convexStorybookReferences } from './runtime';

function assertContext(
  result: Awaited<ReturnType<ReturnType<typeof useStorybookDatabaseClient>['runContextConformance']>>
) {
  if (
    result.ambient.mismatches !== 0 ||
    result.explicit.mismatches !== 0 ||
    result.convexHelper.status !== 'supported'
  ) {
    throw new Error(`The browser-local Convex context check failed: ${JSON.stringify(result)}`);
  }
}

function RuntimeProof() {
  const client = useStorybookDatabaseClient();
  const reset = useStorybookDatabaseReset();
  const [status, setStatus] = useState('Ready to run the browser-local Convex conformance checks');

  return (
    <main style={{ maxWidth: 760, padding: 32 }}>
      <h1>Browser-local Convex foundation</h1>
      <p>{status}</p>
      <button
        type="button"
        onClick={async () => {
          assertContext(await client.runContextConformance());
          expect(await client.runNetworkProbe()).toBe('Convex Storybook workers cannot make network requests.');
          expect(await client.runHttpProbe()).toEqual({ body: { error: 'Not found' }, status: 404 });
          expect(await client.runRollbackProbe()).toEqual({
            error: 'Intentional rollback probe',
            usersAfterFailure: 0,
          });
          const scheduled = await client.runSchedulerProbe();
          expect(scheduled.after.users).toBe(1);
          expect(scheduled.after.rulesets).toBe(0);
          expect(await client.query(convexStorybookReferences.migrationsAdminDashboard, { ids: [] })).toMatchObject({
            snapshots: [],
          });
          expect(await client.mutation(convexStorybookReferences.migrationsSyncRuns, { ids: [] })).toEqual({
            synced: 0,
          });
          for (let count = 0; count < 20; count += 1) {
            const nextClient = await reset();
            expect(await nextClient.query(convexStorybookReferences.rulesetsList, {})).toEqual([]);
          }
          setStatus('Context, components, scheduling, rollback, network isolation, and 20 resets passed');
        }}
      >
        Run foundation checks
      </button>
    </main>
  );
}

const meta = preview.meta({
  title: 'Browser-local Convex',
  component: RuntimeProof,
  parameters: {
    database: db((baseline) => {
      baseline.users.push({ $key: 'storybook-observer', name: 'Storybook observer' });
    }),
  },
});

export const Conformance = meta.story({
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('button', { name: 'Run foundation checks' }, { timeout: 30_000 }));
    await expect(
      page.findByText(
        'Context, components, scheduling, rollback, network isolation, and 20 resets passed',
        {},
        { timeout: 45_000 }
      )
    ).resolves.toBeVisible();
  },
});
