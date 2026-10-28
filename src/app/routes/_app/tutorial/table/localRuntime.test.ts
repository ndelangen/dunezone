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
  test('a Reset answers the reads still stalled and the one queued behind them, so the next read and request go through and late answers are dropped', async () => {
    const open = () => new LocalTable(startAt(setup as unknown as TutorialSetup, 'turn-1-storm', 'https://dune.zone'));
    let table = open();
    const left = table;
    const releases: ((value: typeof contents) => void)[] = [];
    const stall = () => new Promise<typeof contents>((resolve) => releases.push(resolve));
    const captures = [stall(), stall(), Promise.resolve(contents), Promise.resolve(contents)];
    const runtime = localRuntime(() => table, {}, { capture: () => captures.shift()! });
    const client = new TableSession(
      'tutorial',
      new GameSubscription('tutorial', runtime.admission!.request, runtime),
      runtime
    );
    const disconnect = client.connect();
    await vi.waitFor(() => expect(client.getSnapshot().table).toBeTruthy());
    const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

    /* The first read stalls, and the page queues the second behind it. */
    client.catalogue({ type: 'token-disc', slug: 'karama' });
    const queued = client.catalogue({ type: 'bundle', slug: 'karama' });
    await flush();
    expect(client.getSnapshot().catalogue).toBeUndefined();

    /* The chapter's Reset swaps the table and answers both: the first frees the slot, the page sends the second, and it is answered too. */
    table = open();
    runtime.settleCaptures();
    await flush();
    expect(client.getSnapshot().catalogue).toMatchObject({ requestId: queued, contents: null });

    /* A fresh read goes through without either old one answering. */
    const fresh = client.catalogue({ type: 'token-disc', slug: 'karama' });
    await vi.waitFor(() =>
      expect(client.getSnapshot().catalogue).toMatchObject({ requestId: fresh, contents: { name: 'Karama' } })
    );

    client.command({ kind: 'spawn-request', type: 'token-disc', slug: 'karama' });
    await vi.waitFor(() =>
      expect(table.room.snapshot.controls!.requests).toMatchObject([{ contents: { name: 'Karama' } }])
    );
    expect(client.getSnapshot().error).toBeNull();

    /* The stalled reads answering at last change nothing. */
    releases.forEach((release) => release(contents));
    await flush();
    expect(client.getSnapshot().catalogue).toMatchObject({ requestId: fresh });
    expect(table.room.snapshot.controls!.requests).toHaveLength(1);
    expect(left.room.snapshot.controls!.requests).toEqual([]);
    disconnect();
    runtime.dispose();
    left.dispose();
    table.dispose();
  });

  test('a spawn asked on a connection that closed before the Reset never reaches the table the Reset sets', async () => {
    const open = () => new LocalTable(startAt(setup as unknown as TutorialSetup, 'turn-1-storm', 'https://dune.zone'));
    let table = open();
    const left = table;
    let release: (value: typeof contents) => void = () => {};
    const captures = [new Promise<typeof contents>((resolve) => (release = resolve))];
    const runtime = localRuntime(() => table, {}, { capture: () => captures.shift()! });
    const client = new TableSession(
      'tutorial',
      new GameSubscription('tutorial', runtime.admission!.request, runtime),
      runtime
    );
    const disconnect = client.connect();
    await vi.waitFor(() => expect(client.getSnapshot().table).toBeTruthy());
    const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

    /* The request stalls on its read, and the connection closes and opens again while it does. */
    client.command({ kind: 'spawn-request', type: 'token-disc', slug: 'karama' });
    await flush();
    runtime.reconnect();
    await vi.waitFor(() => expect(client.getSnapshot().status).toBe('authorized'), { timeout: 10_000 });

    /* The Reset finds nothing of the new connection's to answer; the old read answering at last spawns nothing anywhere. */
    table = open();
    runtime.settleCaptures();
    release(contents);
    await flush();
    expect(table.room.snapshot.controls!.requests).toEqual([]);
    expect(left.room.snapshot.controls!.requests).toEqual([]);
    disconnect();
    runtime.dispose();
    left.dispose();
    table.dispose();
  });
});
