import preview from '@sb/preview';
import { applyAlliance } from '@shared/play/alliances';
import type { AllianceState } from '@shared/play/alliances';
import type { ClientMessage } from '@shared/play/protocol';
import { expect, waitFor, within } from 'storybook/test';

import { VIEWER, faction, alliancesSnapshot } from './alliances.stories.fixture';
import { gameMeta, install } from './game.stories.fixture';
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
        revision: snapshot.revision,
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
              apply(target, {
                kind: 'alliance-accept',
                factionId: own,
                offer: snapshot.alliances!.offers.find((offer) => offer.from === own && offer.to === target)!.id,
              });
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

/** Try it by hand: accept the offer, offer another faction an alliance, take an offer back, or break an alliance. */
export const Live = meta.story({
  /* Freeze the flowing offer arrows for a repeatable visual capture. */
  globals: { motion: 'reduce' },
  beforeEach: install(liveTransport),
});

/* Three alliances at a six-seat table on a tablet-wide screen: the strip sits in its own chip under the phase and stays clear of the toolbar. */
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
    const strip = doc.querySelector('.seated-chip--game [aria-label="Alliances"]')!;
    const phase = doc.querySelector('.seated-phase-status')!;
    const toolbar = doc.querySelector('.seated-toolbar')!;
    await waitFor(async () => {
      await expect(strip.getBoundingClientRect().top).toBeGreaterThanOrEqual(phase.getBoundingClientRect().bottom);
      const [box, tools] = [strip.getBoundingClientRect(), toolbar.getBoundingClientRect()];
      await expect(box.right <= tools.left || box.top >= tools.bottom, 'The alliances run under the toolbar.').toBe(
        true
      );
    });
  },
});
