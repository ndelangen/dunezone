/* @vitest-environment jsdom */

import { capturedTokenStackKey } from '@shared/play/assetCapture';
import type { GameSnapshot } from '@shared/play/protocol';
import { afterEach, expect, test, vi } from 'vite-plus/test';

import { bringYourOwnPieces } from './bringYourOwnPieces';
import type { TablePlayers } from './chapterScript';

afterEach(() => {
  document.body.innerHTML = '';
});

const KARAMA_ID = 'asset-karama';
const players = (captured: string | undefined): TablePlayers => ({
  act: vi.fn(),
  viewOf: () => ({}) as GameSnapshot,
  others: () => [],
  landings: () => [],
  captured: () => captured,
});
const request = (assetId: string, name: string, type = 'token-disc') => ({
  id: `spawn-${assetId}`,
  requesterSeat: 'seat-1',
  requesterName: 'Learner',
  contents: { assetId, name, type },
});
const piece = (stackKey: string, label: string, inventory?: 'shared') => ({
  id: stackKey,
  label,
  stackKey,
  inventory,
  items: [],
});
const step = (snapshot: () => GameSnapshot, captured: string | undefined, id: string) =>
  bringYourOwnPieces.tasks(snapshot, players(captured)).find((task) => task.id === id)!;

/* An owner, bundle or deck with Karama in its name lists in the same search, so only the token's own row is Karama. */
test('finding Karama waits for the token-disc row to be picked, not a row named for it', () => {
  document.body.innerHTML = `<div data-window="shared">
    <div role="option" data-spawn-asset="bundle/karama-pack" data-combobox-active>Karama pack</div>
    <div role="option" data-spawn-asset="token-disc/karama">Karama</div>
    <button>Request</button>
  </div>`;
  const find = step(() => ({}) as GameSnapshot, undefined, 'find');
  expect(find.done(undefined as never, undefined as never)).toBe(false);
  const anchor = find.anchor.kind === 'page' ? find.anchor.element() : null;
  expect(anchor?.getAttribute('data-spawn-asset')).toBe('token-disc/karama');
  document.querySelector('[data-spawn-asset="bundle/karama-pack"]')!.removeAttribute('data-combobox-active');
  document.querySelector('[data-spawn-asset="token-disc/karama"]')!.setAttribute('data-combobox-active', '');
  expect(find.done(undefined as never, undefined as never)).toBe(true);
});

test('follows the request and pieces Karama’s selection captured, whatever else is named Karama', () => {
  let view = {
    controls: { requests: [request('asset-pack', 'Karama pack', 'bundle')] },
    table: { pieces: [piece(capturedTokenStackKey('asset-pack'), 'Karama', 'shared')] },
  } as unknown as GameSnapshot;
  const snapshot = () => view;
  expect(step(snapshot, KARAMA_ID, 'request').done(undefined as never, undefined as never)).toBe(false);
  expect(step(snapshot, KARAMA_ID, 'approved').done(undefined as never, undefined as never)).toBe(false);

  view = { ...view, controls: { requests: [request(KARAMA_ID, 'Karama')] } } as unknown as GameSnapshot;
  expect(step(snapshot, KARAMA_ID, 'request').done(undefined as never, undefined as never)).toBe(true);
  /* Before the learner asks, nothing at the table is Karama's. */
  expect(step(snapshot, undefined, 'request').done(undefined as never, undefined as never)).toBe(false);

  /* Approved, it waits in the inventory; placed, it keeps its stack key whatever its label says. */
  view = {
    controls: { requests: [] },
    table: { pieces: [piece(capturedTokenStackKey(KARAMA_ID), 'Karama', 'shared')] },
  } as unknown as GameSnapshot;
  expect(step(snapshot, KARAMA_ID, 'approved').done(undefined as never, undefined as never)).toBe(true);
  expect(step(snapshot, KARAMA_ID, 'place').done(undefined as never, undefined as never)).toBe(false);
  view = {
    controls: { requests: [] },
    table: { pieces: [piece(capturedTokenStackKey(KARAMA_ID), '2× Karama')] },
  } as unknown as GameSnapshot;
  expect(step(snapshot, KARAMA_ID, 'place').done(undefined as never, undefined as never)).toBe(true);
});
