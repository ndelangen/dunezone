/** @vitest-environment jsdom */
import { expect, test, vi } from 'vite-plus/test';

import { TableSession } from '@app/db/tabletop/TableSession';
import { GameSubscription } from '@app/routes/_app/play/multiplayer/GameSubscription';
import { predictionReveal } from '@app/routes/_app/play/panels/result/useResultPanel';

import setup from '../setup/setup.json';
import { startAt } from '../setup/tutorialSetup';
import type { TutorialSetup } from '../setup/tutorialSetup';
import { localRuntime } from './localRuntime';
import { LocalTable } from './localTable';

/** The no-card fallback sends a real command and the local table publishes the revealed choice. */
test('reveals an older prediction through the table session', async () => {
  const start = startAt(setup as unknown as TutorialSetup, 'turn-1-storm', 'https://dune.zone');
  const [stepId, prediction] = Object.entries(start.stored.privatePredictions)[0]!;
  start.stored.factionInventories[prediction.factionId] = start.stored.factionInventories[prediction.factionId]!.filter(
    (piece) => piece.stackKey !== `prediction:${stepId}`
  );
  const table = new LocalTable(start);
  const runtime = localRuntime(
    () => table,
    {},
    {
      capture: async () => {
        throw new Error('No catalogue read expected');
      },
    }
  );
  const client = new TableSession(
    'tutorial',
    new GameSubscription('tutorial', runtime.admission!.request, runtime),
    runtime
  );
  const disconnect = client.connect();
  try {
    await vi.waitFor(() => expect(client.getSnapshot().table).toBeTruthy());
    expect(predictionReveal(client.getSnapshot().table!)).toBe('button');
    client.command({ kind: 'prediction-reveal', stepId });
    await vi.waitFor(() =>
      expect(client.getSnapshot().table!.snapshot.predictions![stepId]!.revealedAt).not.toBeNull()
    );
    expect(client.getSnapshot().table!.snapshot.predictions![stepId]!.choice).toEqual(prediction.choice);
    expect(predictionReveal(client.getSnapshot().table!)).toBeNull();
  } finally {
    disconnect();
    runtime.dispose();
    table.dispose();
  }
});
