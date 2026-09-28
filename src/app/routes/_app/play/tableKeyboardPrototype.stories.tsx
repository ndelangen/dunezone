/*
 * PROTOTYPE, #1323 F29. Throwaway, on prototype/1323-1323-f29-table-keyboard, which never merges.
 *
 * The playing table from the product fixture, with the pointer resting on the spice supply disc.
 * An AZERTY player presses the key that carries 1 and & twice: once with Shift, which types 1, and once without, which types &.
 * Each story answers the spice commands through the rules the Worker runs, so the spice lands beside the disc as it would in a game, and ends holding Alt so the stack counts show.
 * A is main as it is, B the ticket's one keyboard owner, C that owner reading the physical key.
 * Flip the floating bar at the bottom left, or set `?variant=a|b|c` on the route, to try the keys by hand.
 */
import preview from '@sb/preview';
import { applyPieceAction, nextSnapshot } from '@shared/play/commands';
import { tableForViewer } from '@shared/play/protocol';
import type { ClientMessage, GameSnapshot } from '@shared/play/protocol';
import { spiceSupplySlot } from '@shared/play/spiceSupply';
import { TRACKER_DISC_TOP_Y } from '@shared/play/tableTrackers';
import { expect, waitFor, within } from 'storybook/test';

import { refText, SEED_REF_TOKEN } from '@db/storybook';

import { gameMeta, install, session } from './game.stories.fixture';
import { mapViewPoint } from './playing.stories.fixture';
import { GAME_KEY, productTransport } from './product.stories.fixture';
import type { TableKeyboardVariant } from './tableKeyboardPrototype';

const meta = preview.meta({
  ...gameMeta,
  title: 'Prototype 1323 1323-f29-table-keyboard',
});

const VIEWER_SEAT = 'seat-2';

type Command = Extract<ClientMessage, { type: 'command' }>;

/* One key press as an AZERTY keyboard reports it: the & key is `Digit1` by position and types 1 only with Shift. */
function press(document: Document, key: string, shiftKey: boolean) {
  const target = document.activeElement ?? document.body;
  const init = { key, code: 'Digit1', shiftKey, bubbles: true, cancelable: true };
  if (shiftKey) {
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift', code: 'ShiftLeft', shiftKey, bubbles: true }));
  }
  target.dispatchEvent(new KeyboardEvent('keydown', init));
  target.dispatchEvent(new KeyboardEvent('keyup', init));
  if (shiftKey) {
    target.dispatchEvent(new KeyboardEvent('keyup', { key: 'Shift', code: 'ShiftLeft', bubbles: true }));
  }
}

/* Answers each new spice command as the Worker would, through the shared rules, and returns the commands answered. */
function answerSpice(answered: Set<string>, snapshot: { current: GameSnapshot }) {
  const commands = session.transport.messages.filter(
    (message): message is Command => message.type === 'command' && !answered.has(message.commandId)
  );
  for (const command of commands) {
    answered.add(command.commandId);
    if (command.action.kind !== 'spice-spawn') {
      continue;
    }
    const current = snapshot.current;
    const table = applyPieceAction(tableForViewer(current, VIEWER_SEAT), command.action, current.phase, 'Klyzx');
    snapshot.current = nextSnapshot(current, table);
    session.transport.deliver(session.transport.view(snapshot.current, command.commandId));
  }
}

function spawnedCounts() {
  return session.transport.messages.flatMap((message) =>
    message.type === 'command' && message.action.kind === 'spice-spawn' ? [message.action.count] : []
  );
}

function pressesOverTheDisc(variant: TableKeyboardVariant, expected: number[]) {
  return async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const document = canvasElement.ownerDocument;
    const page = within(document.body);
    await page.findByRole('group', { name: 'Table view' }, { timeout: 30_000 });
    await page.findByRole('navigation', { name: 'Prototype variants for #1323 F29' });
    await waitFor(
      () => {
        const canvas = document.querySelector('.dune-play-shell canvas');
        expect(canvas?.getBoundingClientRect().height).toBeGreaterThan(100);
        expect(document.querySelector('[data-piece-id="treachery-deck"]')).toHaveTextContent('10');
      },
      { timeout: 30_000 }
    );
    const slot = spiceSupplySlot();
    const [clientX, clientY] = mapViewPoint(document, [slot.position[0], TRACKER_DISC_TOP_Y + 0.015, slot.position[2]]);
    const scene = document.querySelector('canvas')!;
    const pointer = { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', clientX, clientY };
    await waitFor(
      () => {
        scene.dispatchEvent(new PointerEvent('pointermove', pointer));
        expect(scene.style.cursor).toBe('pointer');
      },
      { timeout: 30_000 }
    );

    const answered = new Set<string>();
    const snapshot = { current: session.transport.snapshot };
    press(document, '1', true);
    press(document, '&', false);
    /* The one-second draw would fire in this time if a press had armed it. */
    await new Promise((resolve) => setTimeout(resolve, 1200));
    answerSpice(answered, snapshot);
    expect(spawnedCounts(), `variant ${variant}`).toEqual(expected);
    expect(
      session.transport.messages.some((message) => message.type === 'command' && message.action.kind === 'split')
    ).toBe(false);

    document.body.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Alt', code: 'AltLeft', altKey: true, bubbles: true })
    );
    await waitFor(() => expect(document.querySelector('.dune-play-shell')).toHaveAttribute('data-show-counts', 'true'));
    const initial = session.transport.snapshot.table.pieces;
    const changed = snapshot.current.table.pieces.filter(
      (piece) => JSON.stringify(piece) !== JSON.stringify(initial.find((before) => before.id === piece.id))
    );
    for (const piece of changed) {
      await waitFor(() =>
        expect(document.querySelector(`[data-piece-id="${piece.id}"]`)).toHaveTextContent(String(piece.items.length))
      );
    }
  };
}

const path = (variant: TableKeyboardVariant) =>
  refText(GAME_KEY, `/play/${SEED_REF_TOKEN}${variant === 'a' ? '' : `?variant=${variant}`}`);

/* A: the disc ignores a digit typed with Shift, and the & key types no digit, so neither press spawns spice. */
export const VariantA = meta.story({
  args: { path: path('a') },
  beforeEach: install(() => productTransport(VIEWER_SEAT)),
  play: pressesOverTheDisc('a', []),
});

/* B: the typed 1 spawns one spice whatever Shift does; the & key still types no digit. */
export const VariantB = meta.story({
  args: { path: path('b') },
  beforeEach: install(() => productTransport(VIEWER_SEAT)),
  play: pressesOverTheDisc('b', [1]),
});

/* C: the key in the 1 position spawns one spice with and without Shift, so the two presses spawn two. */
export const VariantC = meta.story({
  args: { path: path('c') },
  beforeEach: install(() => productTransport(VIEWER_SEAT)),
  play: pressesOverTheDisc('c', [1, 1]),
});
