/* @vitest-environment jsdom */

import { capturedTokenStackKey } from '@shared/play/assetCapture';
import type { GameSnapshot } from '@shared/play/protocol';
import { afterEach, expect, test, vi } from 'vite-plus/test';

import { bringYourOwnPieces } from './bringYourOwnPieces';
import type { TablePlayers } from './chapterScript';

afterEach(() => {
  document.body.innerHTML = '';
  vi.useRealTimers();
});

const HMS_ID = 'asset-hms';
const players = (captured: string | undefined, snapshot: () => GameSnapshot): TablePlayers => ({
  act: vi.fn(),
  viewOf: () => ({}) as GameSnapshot,
  others: () => [],
  landings: () => [],
  acceptedActions: () => [],
  pings: () => [],
  captured: () => captured,
  capturedPieces: () => (captured ? snapshot().table.pieces.filter((piece) => piece.id === captured) : []),
});
const request = (assetId: string, name: string, type = 'token-pointer') => ({
  id: `spawn-${assetId}`,
  requesterSeat: 'seat-1',
  requesterName: 'Learner',
  contents: { assetId, name, type },
});
const piece = (stackKey: string, label: string, inventory?: 'shared') => ({
  id: stackKey === capturedTokenStackKey(HMS_ID) ? HMS_ID : stackKey,
  label,
  stackKey: `token:opaque-${stackKey.length}`,
  inventory,
  items: [],
});
const step = (snapshot: () => GameSnapshot, captured: string | undefined, id: string) =>
  bringYourOwnPieces.tasks(snapshot, players(captured, snapshot)).find((task) => task.id === id)!;

/* An owner, bundle or deck with HMS in its name lists in the same search, so only the token's own row is HMS. */
test('finding HMS waits for the token-pointer row to be picked, not a row named for it', () => {
  document.body.innerHTML = `<div data-window="shared">
    <div role="option" data-spawn-asset="bundle/hms-pack" data-combobox-active>HMS pack</div>
    <div role="option" data-spawn-asset="token-pointer/hms">HMS</div>
    <button aria-label="Request"></button>
  </div>`;
  const find = step(() => ({}) as GameSnapshot, undefined, 'find');
  expect(find.done(undefined as never, undefined as never)).toBe(false);
  const anchor = find.anchor.kind === 'page' ? find.anchor.element() : null;
  expect(anchor?.getAttribute('data-spawn-asset')).toBe('token-pointer/hms');
  document.querySelector('[data-spawn-asset="bundle/hms-pack"]')!.removeAttribute('data-combobox-active');
  document.querySelector('[data-spawn-asset="token-pointer/hms"]')!.setAttribute('data-combobox-active', '');
  expect(find.done(undefined as never, undefined as never)).toBe(true);
  document.querySelector('button')!.setAttribute('aria-disabled', 'true');
  expect(find.done(undefined as never, undefined as never)).toBe(false);
});

test('follows the request and pieces HMS’s selection captured, whatever else is named HMS', () => {
  let view = {
    controls: { requests: [request('asset-pack', 'HMS pack', 'bundle')] },
    table: { pieces: [piece(capturedTokenStackKey('asset-pack'), 'HMS', 'shared')] },
  } as unknown as GameSnapshot;
  const snapshot = () => view;
  vi.useFakeTimers();
  const approved = step(snapshot, HMS_ID, 'approved');
  const watch = approved.begin(undefined as never);
  expect(step(snapshot, HMS_ID, 'request').done(undefined as never, undefined as never)).toBe(false);
  expect(approved.done(watch, undefined as never)).toBe(false);

  view = { ...view, controls: { requests: [request(HMS_ID, 'HMS')] } } as unknown as GameSnapshot;
  expect(step(snapshot, HMS_ID, 'request').done(undefined as never, undefined as never)).toBe(true);
  /* Before the learner asks, nothing at the table is HMS's. */
  expect(step(snapshot, undefined, 'request').done(undefined as never, undefined as never)).toBe(false);

  /* Approved, it waits in the inventory; placed, its projected identity stays usable whatever its label or opaque stack key says. */
  view = {
    controls: { requests: [] },
    table: { pieces: [piece(capturedTokenStackKey(HMS_ID), 'HMS', 'shared')] },
  } as unknown as GameSnapshot;
  expect(approved.done(watch, undefined as never)).toBe(true);
  approved.finish?.(watch);
  expect(step(snapshot, HMS_ID, 'place').done(undefined as never, undefined as never)).toBe(false);
  view = {
    controls: { requests: [] },
    table: { pieces: [piece(capturedTokenStackKey(HMS_ID), '2× HMS')] },
  } as unknown as GameSnapshot;
  expect(step(snapshot, HMS_ID, 'place').done(undefined as never, undefined as never)).toBe(true);
});
