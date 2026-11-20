import type { GameSnapshot } from '@shared/play/protocol';
import { within } from 'storybook/test';

import { draftingSnapshot } from './drafting.stories.fixture';
import { install } from './game.stories.fixture';
import { productTransport, SIX, swappingSnapshot } from './product.stories.fixture';

/* The seat the stories watch the deal from (#2987); it is dealt House Harkonnen. */
const VIEWER = 'seat-2';
export const VIEWER_FACTION = 'House Harkonnen';

let live: { snapshot: GameSnapshot; transport: ReturnType<typeof productTransport> } | null = null;

/** Every player has drafted and readied: the deal is a moment away, watched from the viewer's seat or by a spectator. */
export const beforeTheDeal = (viewer: typeof VIEWER | 'neutral' = VIEWER) =>
  install(() => {
    const ready = SIX.map((player) => player.seat);
    const snapshot = draftingSnapshot(SIX, 6, { ready });
    live = { snapshot, transport: productTransport(viewer, snapshot) };
    return live.transport;
  });

/** Sends the page the room's next table. */
function deliver(snapshot: GameSnapshot) {
  snapshot.revision = live!.snapshot.revision + 1;
  live = { ...live!, snapshot };
  live.transport.deliver(live.transport.view(snapshot));
}

/** Waits for the drafting table, then deals: every seat gets its faction, and Trading begins. */
export async function dealFactions(canvasElement: HTMLElement) {
  const page = within(canvasElement.ownerDocument.body);
  await page.findByRole('button', { name: /^Controls/ }, { timeout: 30_000 });
  deliver(swappingSnapshot());
  return page;
}

/** The viewer trades factions with seat 1, as an accepted trade does: the two seats swap their factions. Returns the viewer's new faction. */
export function tradeWithSeatOne() {
  const snapshot = structuredClone(live!.snapshot);
  const seats = snapshot.roster!.seats;
  const viewer = seats.find((seat) => seat.id === VIEWER)!;
  const other = seats.find((seat) => seat.id === 'seat-1')!;
  [viewer.faction, other.faction] = [other.faction, viewer.faction];
  deliver(snapshot);
  return viewer.faction!.name;
}

/** Trading ends and Setup begins, with every seat keeping its faction. */
export function startSetup() {
  const snapshot = structuredClone(live!.snapshot);
  snapshot.stage = 'setup';
  deliver(snapshot);
}
