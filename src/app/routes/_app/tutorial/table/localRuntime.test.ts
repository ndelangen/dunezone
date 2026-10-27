/** @vitest-environment jsdom */
import { storedSpawnContentsSchema } from '@shared/play/inventory';
import { describe, expect, test, vi } from 'vite-plus/test';

import { TableSession } from '@app/db/tabletop/TableSession';
import { GameSubscription } from '@app/routes/_app/play/multiplayer/GameSubscription';

import setup from '../setup/setup.json';
import { startAt } from '../setup/tutorialSetup';
import type { TutorialSetup } from '../setup/tutorialSetup';
import { localRuntime } from './localRuntime';
import { LocalTable } from './localTable';

/* The page's table session talks to the local table as it talks to the Worker, one catalogue read at a time. */
describe('a tutorial page’s catalogue reads', () => {
  const contents = storedSpawnContentsSchema.parse({
    assetId: 'karama',
    name: 'Karama',
    type: 'token-disc',
    pieces: [
      {
        id: 'member-0',
        label: 'Karama',
        kind: 'force',
        owner: 'shared',
        inventory: 'shared',
        color: '#d5ba8c',
        accent: '#ead9bb',
        items: [
          {
            id: 'member-0-0',
            faceUp: true,
            artwork: {
              front: 'https://dune.zone/published/karama',
              back: 'https://dune.zone/published/karama',
              name: 'Karama',
              type: 'token-disc',
            },
          },
        ],
        stackKey: 'token:karama',
        position: [-25, 0, -25],
        orientation: 0,
        zoneId: null,
        locked: false,
      },
    ],
    members: [{ assetId: 'karama', count: 1 }],
    definitions: [],
  });
  test('a Reset answers a read still stalled, so the next request is captured and requested and the late answer is dropped', async () => {
    const open = () => new LocalTable(startAt(setup as unknown as TutorialSetup, 'turn-1-storm', 'https://dune.zone'));
    let table = open();
    const left = table;
    let release: (value: typeof contents) => void = () => {};
    const captures = [new Promise<typeof contents>((resolve) => (release = resolve)), Promise.resolve(contents)];
    const runtime = localRuntime(() => table, {}, { capture: () => captures.shift()! });
    const client = new TableSession(
      'tutorial',
      new GameSubscription('tutorial', runtime.admission!.request, runtime),
      runtime
    );
    const disconnect = client.connect();
    await vi.waitFor(() => expect(client.getSnapshot().table).toBeTruthy());
    const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

    /* The read stalls, and the page holds every later request behind it. */
    const stalled = client.catalogue({ type: 'token-disc', slug: 'karama' });
    await flush();
    expect(client.getSnapshot().catalogue).toBeUndefined();

    /* The chapter's Reset swaps the table and answers the read it left behind. */
    table = open();
    runtime.settleCaptures();
    await flush();
    expect(client.getSnapshot().catalogue).toMatchObject({ requestId: stalled, contents: null });

    client.command({ kind: 'spawn-request', type: 'token-disc', slug: 'karama' });
    await vi.waitFor(() =>
      expect(table.room.snapshot.controls!.requests).toMatchObject([{ contents: { name: 'Karama' } }])
    );
    expect(client.getSnapshot().error).toBeNull();

    /* The stalled read answering at last changes nothing. */
    release(contents);
    await flush();
    expect(client.getSnapshot().catalogue).toMatchObject({ requestId: stalled, contents: null });
    expect(table.room.snapshot.controls!.requests).toHaveLength(1);
    expect(left.room.snapshot.controls!.requests).toEqual([]);
    disconnect();
    runtime.dispose();
    left.dispose();
    table.dispose();
  });
});
