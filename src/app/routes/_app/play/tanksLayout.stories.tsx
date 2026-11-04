import preview from '@sb/preview';
import { STANDARD_PHASES } from '@shared/play/phases';
import { item, piece, place } from '@shared/play/setupSupply';
import { setTanksLayoutOption, TANKS_LAYOUTS } from '@shared/play/tableFurnitureLayout';
import type { TanksLayout, TanksLayoutOption } from '@shared/play/tableFurnitureLayout';
import { restingPositionAt, TABLE_VISIBLE_RADIUS } from '@shared/play/tableGeometry';
import { userEvent, waitFor } from 'storybook/test';

import { gameMeta, install } from './game.stories.fixture';
import { factions, playingSnapshot, productTransport } from './product.stories.fixture';

/*
 * Tanks layout exploration (#2675): the same Revival scene, with the leaders of every faction dead, on each candidate layout.
 * Revival recommends the bottom view, so each story opens on the Tanks.
 */
const meta = preview.meta({
  ...gameMeta,
  title: 'Play/Tanks layout',
});

const imageHref = (path: string) => new URL(path, location.origin).href;

/* A small deterministic jitter, so the pile looks tossed in rather than gridded. */
function jitter(seed: number) {
  const value = Math.sin(seed * 12.9898) * 43_758.5453;
  return value - Math.floor(value) - 0.5;
}

/** Where dead leaders land: the Tanks' own area of the layout, between its boundary and the shared item slots. */
function tanksArea(option: TanksLayoutOption) {
  const layout: TanksLayout = TANKS_LAYOUTS[option];
  if (layout.pile) {
    return layout.pile;
  }
  const boundary = layout.boundary;
  const halfWidth =
    boundary?.kind === 'tray'
      ? boundary.maxX
      : boundary?.kind === 'crescent'
        ? boundary.halfWidth
        : layout.dividers.length
          ? Math.min(...layout.dividers.map(Math.abs))
          : layout.shelfWidth / 2;
  /* Below the engraved name, so the pile never hides it. */
  const top = Math.max(layout.labelZ + 0.35, boundary?.kind === 'tray' ? boundary.minZ : TABLE_VISIBLE_RADIUS + 0.2);
  const sharedTop = Math.min(...layout.sharedItems.filter(([x]) => Math.abs(x) < halfWidth).map(([, , z]) => z));
  const bottom =
    boundary?.kind === 'tray'
      ? boundary.maxZ
      : boundary?.kind === 'crescent'
        ? boundary.maxZ
        : Number.isFinite(sharedTop)
          ? sharedTop - 0.7
          : layout.shelfMaxZ - 0.2;
  return {
    halfWidth: halfWidth - 0.45,
    top: top + 0.75,
    bottom: bottom - 0.45,
  };
}

function revivalSnapshot(option: TanksLayoutOption) {
  const snapshot = playingSnapshot('seat-2');
  snapshot.phase = (snapshot.phases ?? STANDARD_PHASES).findIndex((entry) => entry.id === 'revival');
  const area = tanksArea(option);
  /* Fourteen dead leaders: a heavy mid-game Tanks, two or three from each faction. */
  const dead = factions.flatMap((faction) =>
    faction.data.leaders.slice(0, 3).map((leader, index) => ({ faction, leader, index }))
  );
  const count = Math.min(dead.length, 16);
  const columns = Math.max(1, Math.floor((area.halfWidth * 2) / 0.95) + 1);
  dead.slice(0, count).forEach(({ faction, leader, index }, position) => {
    const column = position % columns;
    const row = Math.floor(position / columns);
    const x = -area.halfWidth + (columns > 1 ? (column * area.halfWidth * 2) / (columns - 1) : 0);
    const z = area.top + row * 0.95;
    const id = `dead-${faction.slug}-${index}`;
    const token = piece(
      id,
      leader.name,
      faction.slug,
      faction.data.themeColor,
      'force',
      `leader:${faction.slug}:${index}`
    );
    token.items = [
      item(
        `${id}-item`,
        leader.name,
        imageHref(faction.leaders[index]!.front),
        imageHref(faction.token),
        'token-disc',
        true
      ),
    ];
    const placed = place(token, [
      x + jitter(position) * 0.35,
      0,
      Math.min(z + jitter(position + 50) * 0.3, area.bottom),
    ]);
    placed.position = restingPositionAt(placed.position, placed);
    snapshot.table.pieces.push(placed);
  });
  snapshot.versions = Object.fromEntries(snapshot.table.pieces.map((entry) => [entry.id, snapshot.revision]));
  return snapshot;
}

function onLayout(option: TanksLayoutOption) {
  return () => {
    setTanksLayoutOption(option);
    const cleanup = install(() => productTransport('seat-2', revivalSnapshot(option)))();
    return () => {
      cleanup();
      setTanksLayoutOption('current');
    };
  };
}

/* Revival recommends the bottom view; the stories turn the camera there, onto the Tanks. */
async function lookAtTanks({ canvasElement }: { canvasElement: HTMLElement }) {
  const bottom = await waitFor(
    () => {
      const button = canvasElement.ownerDocument.querySelector<HTMLButtonElement>(
        '.camera-dial__view[data-view="bottom"]'
      );
      if (!button) {
        throw new Error('The camera dial is not up yet');
      }
      return button;
    },
    { timeout: 20_000 }
  );
  await userEvent.click(bottom);
}

export const Current = meta.story({
  beforeEach: onLayout('current'),
  play: lookAtTanks,
});

/** A: an engraved line continues the round table's edge across a wider, deeper shelf; shared slots stay below. */
export const EngravedCircle = meta.story({
  beforeEach: onLayout('groove'),
  play: lookAtTanks,
});

/** B: a large recessed tray with a rim, set apart from the round table by a strip of bare plate. */
export const RecessedTray = meta.story({
  beforeEach: onLayout('tray'),
  play: lookAtTanks,
});

/** C: a recessed basin whose top edge follows the round table's curve a short gap away. */
export const CrescentBasin = meta.story({
  beforeEach: onLayout('crescent'),
  play: lookAtTanks,
});

/** D: the engraved circle, and the Tanks take the shelf's full depth, with the shared slots in columns beside them. */
export const FullDepthTanks = meta.story({
  beforeEach: onLayout('columns'),
  play: lookAtTanks,
});

/** E: a round vat sunk into the shelf behind a raised lip. */
export const RoundVat = meta.story({ beforeEach: onLayout('vat'), play: lookAtTanks });

/** F: a wide pill-shaped well behind a raised lip. */
export const Pill = meta.story({ beforeEach: onLayout('pill'), play: lookAtTanks });

/** G: an octagonal well with cut corners behind a raised lip. */
export const Octagon = meta.story({ beforeEach: onLayout('octagon'), play: lookAtTanks });

/** H: a trough that curves round the table below the bottom seat, behind a raised lip. */
export const ArcRoundTheTable = meta.story({ beforeEach: onLayout('trough'), play: lookAtTanks });
