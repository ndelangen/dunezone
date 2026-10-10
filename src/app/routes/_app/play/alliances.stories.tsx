import preview from '@sb/preview';
import { applyAlliance } from '@shared/play/alliances';
import type { AllianceState } from '@shared/play/alliances';
import type { ClientMessage, GameSnapshot } from '@shared/play/protocol';
import { rosterSeat } from '@shared/play/schema';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { STORYBOOK_NOW } from '@db/storybook';

import { gameMeta, install, lastCommand, session } from './game.stories.fixture';
import { playingSnapshot, productTransport } from './product.stories.fixture';

const meta = preview.meta({
  ...gameMeta,
  title: 'Play/Alliances',
  loaders: [
    async () => {
      await import('./multiplayer/HostedTable');
    },
  ],
});

const VIEWER = 'seat-2';
const faction = (snapshot: GameSnapshot, seat: string) => rosterSeat(snapshot.roster, seat)!.faction!.id;

/* Seats 4 and 5 are allied, and seat 1 has offered the viewer an alliance. */
function alliancesSnapshot(): GameSnapshot {
  const snapshot = playingSnapshot(VIEWER);
  snapshot.alliances = {
    groups: [[faction(snapshot, 'seat-4'), faction(snapshot, 'seat-5')]],
    offers: [{ from: faction(snapshot, 'seat-1'), to: faction(snapshot, VIEWER), at: STORYBOOK_NOW }],
  };
  return snapshot;
}

/**
 * The table as the Worker runs it: every alliance command is applied by the shared rules, and any other faction the viewer offers an alliance accepts it a moment later, so the whole round trip can be tried by hand.
 */
function liveTransport() {
  let snapshot = alliancesSnapshot();
  const own = faction(snapshot, VIEWER);
  const factions = snapshot.roster!.seats.flatMap(({ faction: entry }) => (entry ? [entry.id] : []));
  const apply = (factionId: string, action: Parameters<typeof applyAlliance>[1]) => {
    const alliances: AllianceState = applyAlliance(snapshot.alliances!, action, {
      factionId,
      factions,
      now: Date.now(),
    });
    snapshot = { ...snapshot, revision: snapshot.revision + 1, alliances };
  };
  const transport = productTransport(VIEWER, snapshot, {
    answerCommand: (message: Extract<ClientMessage, { type: 'command' }>) => {
      const { action } = message;
      if (action.kind.startsWith('alliance-')) {
        apply(own, action as Parameters<typeof applyAlliance>[1]);
        if (action.kind === 'alliance-offer') {
          const target = action.factionId;
          setTimeout(() => {
            if (snapshot.alliances!.offers.some((offer) => offer.from === own && offer.to === target)) {
              apply(target, { kind: 'alliance-accept', factionId: own });
              transport.deliver(transport.view(snapshot));
            }
          }, 4000);
        }
      }
      return transport.view(snapshot, message.commandId);
    },
  });
  return transport;
}

async function openPlayer(canvasElement: HTMLElement, name: RegExp) {
  const page = within(canvasElement.ownerDocument.body);
  await userEvent.click(await page.findByRole('tab', { name }, { timeout: 30_000 }));
  const info = page.getAllByRole('tab', { name: 'Info' }).at(-1)!;
  await userEvent.click(info);
  return page;
}

/** Try it by hand: accept or decline the offer, offer another faction an alliance, or leave one. */
export const Live = meta.story({
  beforeEach: install(liveTransport),
});

export const IncomingOffer = meta.story({
  beforeEach: install(() => productTransport(VIEWER, alliancesSnapshot())),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('button', { name: 'Accept' }, { timeout: 30_000 }));
    expect(lastCommand()).toMatchObject({
      action: { kind: 'alliance-accept', factionId: faction(session.transport.snapshot, 'seat-1') },
    });
  },
});

export const AlliedPlayerInfo = meta.story({
  beforeEach: install(() => productTransport(VIEWER, alliancesSnapshot())),
  play: async ({ canvasElement }) => {
    const page = await openPlayer(canvasElement, /in an alliance/);
    await waitFor(() => expect(page.getByText(/^Allied with/)).toBeVisible());
  },
});
