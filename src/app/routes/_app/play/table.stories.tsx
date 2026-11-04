import preview from '@sb/preview';
import type { TablePiece } from '@shared/play/model';
import { STANDARD_PHASES } from '@shared/play/phases';
import { item, piece, place } from '@shared/play/setupSupply';
import { cardBaySlotPositions } from '@shared/play/tableFurnitureLayout';
import { restingAmongLeaders } from '@shared/play/tablePhysics';
import { TANKS_PAD } from '@shared/play/tanksShelf';
import { userEvent, waitFor } from 'storybook/test';

import { gameMeta, install } from './game.stories.fixture';
import { capture, cardBack, factions, playingSnapshot, productTransport } from './product.stories.fixture';

const meta = preview.meta({
  ...gameMeta,
  title: 'Play/Table',
});

const READABLE_CARDS: [string, string][] = [
  ['Snooper', '/play-fixtures/dreamrules/snooper.jpg'],
  ['Broken Land', '/play-fixtures/dreamrules/broken-land.jpg'],
  ['Atreides Traitor', '/play-fixtures/product/house-atreides-traitor-0.jpg'],
  ['Atreides Traitor', '/play-fixtures/product/house-atreides-traitor-1.jpg'],
  ['Harkonnen Traitor', '/play-fixtures/product/house-harkonnen-traitor-0.jpg'],
];

/* Cards with small print face up in the left card bay: their table faces are scaled to 512 px, which read sharper than the published size in a blind comparison. */
function readableCardsSnapshot() {
  const snapshot = playingSnapshot('seat-2');
  READABLE_CARDS.forEach(([name, path], index) => {
    const front = new URL(path, location.origin).href;
    snapshot.table.pieces.push(
      place(
        {
          ...piece(`readable-card-${index}`, name, 'shared', '#ad8a45', 'card', `readable:${index}`),
          items: [item(`readable-item-${index}`, name, front, cardBack(), 'card-treachery', true, 'Treachery')],
        },
        cardBaySlotPositions('left')[index]!
      )
    );
  });
  snapshot.versions = Object.fromEntries(snapshot.table.pieces.map((entry) => [entry.id, snapshot.revision]));
  return snapshot;
}

export const ReadableCards = meta.story({
  beforeEach: install(() => productTransport('seat-2', readableCardsSnapshot())),
});

/* A small deterministic jitter, so the pile looks tossed in rather than laid out. */
function jitter(seed: number) {
  const value = Math.sin(seed * 12.9898) * 43_758.5453;
  return value - Math.floor(value) - 0.5;
}

/* A heavy mid-game Tanks in Revival: three leaders of every faction, tossed onto the pad round the table, a few overlapping. */
function tanksSnapshot() {
  const snapshot = playingSnapshot('seat-2');
  snapshot.phase = (snapshot.phases ?? STANDARD_PHASES).findIndex((entry) => entry.id === 'revival');
  const dead = factions.flatMap((faction) =>
    faction.data.leaders.slice(0, 3).map((leader, index) => ({ faction, leader, index }))
  );
  /* Rows start below the engraved name, so the pile never hides it. */
  const rows = [7.05, 7.75, 8.45];
  const spots = rows.flatMap((radius, row) => {
    const count = Math.floor((2 * TANKS_PAD.halfAngle * radius - 0.9) / 0.6);
    return Array.from({ length: count }, (_, index) => {
      const angle = Math.PI / 2 + ((index - (count - 1) / 2) * 0.6) / radius;
      return [Math.cos(angle) * radius + row * 0.15, Math.sin(angle) * radius] as const;
    });
  });
  const captures = Object.fromEntries(factions.map((faction) => [faction.slug, capture(faction)]));
  const placed: TablePiece[] = [];
  dead.forEach(({ faction, leader, index }, position) => {
    const [x, z] = spots[(position * 7) % spots.length]!;
    const id = `dead-${faction.slug}-${index}`;
    const token = piece(
      id,
      leader.name,
      faction.slug,
      faction.data.themeColor,
      'force',
      `leader:${faction.slug}:${index}`
    );
    const art = captures[faction.slug]!.components.leaders[index]!;
    token.items = [item(`${id}-item`, leader.name, art.front, art.back, 'token-disc', true)];
    const tossed = place(token, [x + jitter(position) * 0.2, 0, z + jitter(position + 50) * 0.2]);
    tossed.position = restingAmongLeaders(tossed, tossed.position, placed);
    placed.push(tossed);
  });
  snapshot.table.pieces.push(...placed);
  snapshot.versions = Object.fromEntries(snapshot.table.pieces.map((entry) => [entry.id, snapshot.revision]));
  return snapshot;
}

/* Revival recommends the bottom view; once the table is open, the story turns the camera there, onto the Tanks. */
async function lookAtTanks({ canvasElement }: { canvasElement: HTMLElement }) {
  const bottom = await waitFor(
    () => {
      const document = canvasElement.ownerDocument;
      const button = document.querySelector<HTMLButtonElement>('.camera-dial__view[data-view="bottom"]');
      if (!button || !document.querySelector('[data-scene-ready="true"]')) {
        throw new Error('The table is not open yet');
      }
      return button;
    },
    { timeout: 30_000 }
  );
  await userEvent.click(bottom);
}

/** The Tleilaxu Tanks: a pad curved round the table, set apart from the bottom seat, with room for a heavy pile of leaders. */
export const LeadersInTheTanks = meta.story({
  beforeEach: install(() => productTransport('seat-2', tanksSnapshot())),
  play: lookAtTanks,
});
