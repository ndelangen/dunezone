import { _roots } from '@react-three/fiber/webgpu';
import preview from '@sb/preview';
import type { PieceFlipStyleName } from '@shared/play/pieceFlip';
import { expect, waitFor, within } from 'storybook/test';
import { Vector3 } from 'three';
import type { Camera } from 'three';

import { gameMeta, install } from './game.stories.fixture';
import { chapter, journeyViewers, JourneyPage } from './journey.stories.fixture';
import { piece, sandbox, sandboxReady, sandboxTransport, shown } from './sandbox.stories.fixture';

/*
 * The deck flip prototypes of #2989, on the sandbox table, with each answer from the room held back by `latency`
 * as one across the internet would be. A face-down Spice card lies in front of you and turns over once on its own;
 * hover it and press F to turn it again, or pick up the top card of a deck and press F while holding it.
 */
const meta = preview.meta({
  ...gameMeta,
  title: 'Play/Deck flip/Prototypes',
  component: JourneyPage,
  args: { ...gameMeta.args, step: chapter('Bidding'), seat: 'seat-1', latency: 450 },
  argTypes: {
    seat: { control: 'select', options: journeyViewers() },
    /* Not one of the page's own args: the story reads it to hold back the room's answers. */
    ...({
      latency: { control: { type: 'range', min: 0, max: 1500, step: 50 }, name: 'Room answers after (ms)' },
    } as object),
  },
  parameters: { ...gameMeta.parameters, chromatic: { disableSnapshot: true } },
  globals: { motion: 'on' },
  loaders: [
    async () => {
      await import('./multiplayer/HostedTable');
    },
  ],
});

type Args = { step?: number; seat?: string; latency?: number };

const CARD_ID_PREFIX = 'deck-flip-card';

function variant(name: PieceFlipStyleName) {
  return {
    beforeEach: ({ args }: { args: Args }) => {
      document.documentElement.dataset.trialDeckFlip = name;
      const uninstall = install(() =>
        sandboxTransport(
          { start: Number(args.step ?? 1) - 1, seat: String(args.seat ?? 'seat-1') },
          { latencyMs: Number(args.latency ?? 0) }
        )
      )();
      return () => {
        uninstall();
        delete document.documentElement.dataset.trialDeckFlip;
      };
    },
    play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
      await sandboxReady(within(canvasElement.ownerDocument.body));
      const card = await dealCardInFront();
      await flipByHand(card);
    },
  };
}

/* Takes the top Spice card off its deck and lays it face down in front of the viewer, as the room does for a draw. */
async function dealCardInFront() {
  const table = sandbox.table!;
  const deck = piece((candidate) => candidate.stackKey === 'deck:spice-deck');
  const carryId = `${CARD_ID_PREFIX}-${Date.now()}`;
  /* Beside the deck, on the table's rim, where nothing else lies. */
  const position: [number, number, number] = [deck.position[0] + 1.1, 0.4, deck.position[2] + 1.0];
  table.receive({
    type: 'begin',
    carryId,
    sourcePieceId: deck.id,
    expectedVersion: shown().versions[deck.id]!,
    pickup: 'top',
  });
  table.receive({ type: 'drop', commandId: `${carryId}-drop`, carryId, position, orientation: 0 });
  await expect(table.refusal).toBeUndefined();
  const topItem = deck.items.at(-1)!.id;
  let dealt: { id: string; position: [number, number, number] } | undefined;
  await waitFor(
    () => {
      dealt = shown().table.pieces.find(
        (candidate) => candidate.items.length === 1 && candidate.items.some((item) => item.id === topItem)
      ) as typeof dealt;
      if (!dealt) {
        throw new Error('The dealt card is not on the table yet.');
      }
    },
    { timeout: 5000 }
  );
  return dealt!;
}

/* The table's camera and canvas, read from the scene that drew it. */
function tableView(): { camera: Camera; canvas: HTMLCanvasElement } | null {
  for (const [canvas, root] of _roots) {
    const camera = root.store.getState().camera as Camera | null;
    if (camera && canvas instanceof HTMLCanvasElement && canvas.isConnected) {
      return { camera, canvas };
    }
  }
  return null;
}

/* Hovers the card on the canvas and presses F, as a player would. */
async function flipByHand(card: { position: [number, number, number] }) {
  await new Promise((resolve) => setTimeout(resolve, 1200));
  const view = tableView();
  if (!view) {
    return;
  }
  const box = view.canvas.getBoundingClientRect();
  const point = new Vector3(...card.position).project(view.camera);
  const clientX = box.left + ((point.x + 1) / 2) * box.width;
  const clientY = box.top + ((1 - point.y) / 2) * box.height;
  const init = { clientX, clientY, bubbles: true, pointerId: 1, pointerType: 'mouse', isPrimary: true };
  view.canvas.dispatchEvent(new PointerEvent('pointermove', init));
  await new Promise((resolve) => setTimeout(resolve, 150));
  const key = { key: 'f', code: 'KeyF', bubbles: true };
  window.dispatchEvent(new KeyboardEvent('keydown', key));
  window.dispatchEvent(new KeyboardEvent('keyup', key));
}

/** Today: nothing moves until the room answers and the face's art is in, then the card turns over in half a second. */
export const Today = meta.story(variant('today'));

/** Lift: the card rises at once and hovers, bobbing gently, until its face is in; then it turns over and settles, with a soft flick. */
export const Lift = meta.story(variant('lift'));

/** Edge: the card turns up onto its edge at once and waits there, so no face shows yet; it falls over the rest of the way as soon as the face is in, with a soft flick. */
export const Edge = meta.story(variant('edge'));

/** Tease: one side lifts at once and the card rocks gently, like a thumb under its corner; then it turns over, with a soft flick. */
export const Tease = meta.story(variant('tease'));

/** Snap: a small hop at once, then a quick turn once the face is in, with a soft flick. */
export const Snap = meta.story(variant('snap'));
