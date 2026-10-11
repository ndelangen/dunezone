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
    groups: [{ members: [faction(snapshot, 'seat-4'), faction(snapshot, 'seat-5')], mark: 0 }],
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
  /* A refused command, such as a second click on Accept, leaves the table as it was, as the Worker would. */
  const apply = (factionId: string, action: Parameters<typeof applyAlliance>[1]) => {
    try {
      const alliances: AllianceState = applyAlliance(snapshot.alliances!, action, {
        factionId,
        factions,
        now: Date.now(),
      });
      snapshot = { ...snapshot, revision: snapshot.revision + 1, alliances };
    } catch {
      // The story's other side shows no rejection.
    }
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
  await userEvent.click((await page.findAllByRole('tab', { name }, { timeout: 30_000 }))[0]!);
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

/* Three alliances at a six-seat table on a tablet-wide screen: the strip scrolls beside the logo instead of running over the phase. */
export const ManyAlliancesFitTheHeader = meta.story({
  globals: { viewport: { value: 'appTablet' } },
  beforeEach: install(() => {
    const snapshot = playingSnapshot(VIEWER);
    const pair = (a: string, b: string, mark: number) => ({
      members: [faction(snapshot, a), faction(snapshot, b)],
      mark,
    });
    snapshot.alliances = {
      groups: [pair('seat-1', 'seat-3', 0), pair('seat-4', 'seat-5', 1), pair('seat-2', 'seat-6', 2)],
      offers: [],
    };
    return productTransport(VIEWER, snapshot);
  }),
  play: async ({ canvasElement }) => {
    const doc = canvasElement.ownerDocument;
    await within(doc.body).findAllByRole('img', { name: /are allied/ }, { timeout: 30_000 });
    const strip = doc.querySelector('.seated-brand [aria-label="Alliances"]')!;
    const phase = doc.querySelector('.seated-phase-status')!;
    await waitFor(() =>
      expect(strip.getBoundingClientRect().right).toBeLessThanOrEqual(phase.getBoundingClientRect().left)
    );
  },
});
