import preview from '@sb/preview';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';

import { db, storybookViewer, useStorybookDatabaseClient, useStorybookDatabaseReset } from '@db/storybook';

import { convexStorybookReferences } from './runtime';

function assertContext(
  result: Awaited<ReturnType<ReturnType<typeof useStorybookDatabaseClient>['runContextConformance']>>
) {
  if (
    result.ambient.mismatches !== 0 ||
    result.explicit.mismatches !== 0 ||
    !result.date.deterministicDefault ||
    !result.date.multiArgumentMatchesNative ||
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
          expect(scheduled.after.rulesets).toBe(1);
          expect(
            await client.query(convexStorybookReferences.migrationsAdminDashboard, { ids: [] }, storybookViewer)
          ).toMatchObject({ access: 'admin', snapshots: [] });
          expect(
            await client.mutation(convexStorybookReferences.migrationsSyncRuns, { ids: [] }, storybookViewer)
          ).toEqual({ synced: 0 });
          for (let count = 0; count < 20; count += 1) {
            const nextClient = await reset();
            expect(await nextClient.query(convexStorybookReferences.rulesetsList, {})).toHaveLength(1);
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
    /* The button appears only once the provider's worker has booted, so this wait is the boot's. */
    await userEvent.click(await page.findByRole('button', { name: 'Run foundation checks' }, { timeout: 30_000 }));
    /*
     * The 20 resets behind this text each start and retire a worker, and in a full suite run that costs 48 to 54 seconds against the 4 seconds it costs alone.
     * Both numbers this assertion used to sit between were 45_000: its own budget, and `testTimeout` in `vitest.storybook.config.ts`.
     * So the work was over its budget and over the kill at the same time, and the kill was due first, which is why a failure arrived as a bare timeout that never named the text it was waiting for.
     * The budget is now larger than the measured cost and the kill is larger than everything before it: the boot may spend its full 30s above, and 30 plus 75 lands at 105, fifteen seconds clear of the 120s kill.
     * That fifteen also has to cover the story's own mount, because the kill spans the whole test and not just the two waits inside it. For the ordering to fail, the mount alone would have to run past 15s, which is a quarter of the slowest whole run measured here and three times the bound on everything the play function does before the assertion.
     * The boot's own wait is left alone, since it already expires before the kill and its message names the role and the name it wanted.
     */
    await expect(
      page.findByText(
        'Context, components, scheduling, rollback, network isolation, and 20 resets passed',
        {},
        { timeout: 75_000 }
      )
    ).resolves.toBeVisible();
  },
});
