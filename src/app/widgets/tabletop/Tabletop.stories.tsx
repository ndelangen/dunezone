import preview from '@sb/preview';
import { homepageSnapshot } from '@shared/homepage/setup';
import type { BoardCapture } from '@shared/play/capture';
import { arrakisBoardCapture } from '@shared/play/fixtures/board';
import { tableProgressFor } from '@shared/play/phases';
import { SPECTATOR_SEAT } from '@shared/play/schema';
import type { RoomView } from '@shared/play/updates';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { expect, spyOn, waitFor, within } from 'storybook/test';
import type { MockInstance } from 'storybook/test';

import { TableSession } from '@db/tabletop/TableSession';

import { BoardSkinOverride } from './BoardSkinMaterial';
import type { BoardSkin } from './boardSkins';
import { curvedBoard } from './curvedBoard.fixture';
import { PointerSession } from './PointerSession';
import { PointerSessionContext } from './PointerSessionContext';
import { TableKeyboard } from './TableKeyboard';
import { TableKeyboardContext } from './TableKeyboardContext';
import { TabletopSessionProvider } from './TabletopContext';
import { TabletopScene } from './TabletopScene';

function PreparedTable({
  presentation,
  board,
  skin,
  planet = false,
}: {
  presentation: 'play' | 'preview';
  board?: BoardCapture;
  skin?: BoardSkin;
  planet?: boolean;
}) {
  const [session] = useState(() => {
    const view: RoomView = {
      type: 'view',
      epoch: 'story',
      sequence: 1,
      viewer: { connectionId: 'story', userId: 'story', viewerSeat: SPECTATOR_SEAT, displayName: '', color: '#d7b65c' },
      snapshot: { ...homepageSnapshot(location.origin), board },
      carries: [],
      pointers: [],
    };
    return new TableSession(
      'story',
      {
        status: 'authorized',
        ready: true,
        getSnapshot: () => view,
        serverNow: () => 0,
        send: () => false,
        supportsCommand: () => false,
        subscribe(listener) {
          listener({ ...view, previous: null, snapshotChanged: true });
          return () => {};
        },
      },
      {
        openSocket() {
          throw new Error('The prepared story has no transport.');
        },
        monotonicNow: () => 0,
        onHidden: () => () => {},
        onVisible: () => () => {},
        onOnline: () => () => {},
      }
    );
  });
  const [pointer] = useState(() => new PointerSession());
  const [keyboard] = useState(() => new TableKeyboard());
  const ready = useSyncExternalStore(
    session.subscribeTable,
    () => session.getTable() !== null,
    () => false
  );
  useEffect(() => session.connect(), [session]);
  if (!ready) {
    return null;
  }
  return (
    <BoardSkinOverride value={skin ? { skin, planet } : null}>
      <PointerSessionContext value={pointer}>
        <TableKeyboardContext value={keyboard}>
          <TabletopSessionProvider session={session}>
            <div style={{ height: skin ? '100vh' : 700, display: 'grid' }}>
              <TabletopScene presentation={presentation} stage="play" tableProgress={tableProgressFor(0)} />
            </div>
          </TabletopSessionProvider>
        </TableKeyboardContext>
      </PointerSessionContext>
    </BoardSkinOverride>
  );
}

const meta = preview.meta({ component: PreparedTable, parameters: { layout: 'fullscreen' } });
export const Play = meta.story({ args: { presentation: 'play' } });
/** The homepage's preview draws the table without the play tools, so a visitor has nothing to select. */
export const Homepage = meta.story({
  args: { presentation: 'preview' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('img', { name: 'Game table' })).resolves.toBeInTheDocument();
    await expect(page.queryByRole('button', { name: 'Selected piece actions' })).toBeNull();
    await expect(page.queryByRole('alert')).toBeNull();
  },
});

/** With motion allowed, the preview's pieces arrive one after another; Chromatic captures them at rest in Homepage. */
export const HomepageArrival = meta.story({
  parameters: { chromatic: { disableSnapshot: true } },
  globals: { motion: 'on' },
  args: { presentation: 'preview' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('img', { name: 'Game table' })).resolves.toBeInTheDocument();
    await expect(page.queryByRole('alert')).toBeNull();
  },
});

/* Installed before the story renders, since the authored board can mount before the play starts. */
let objectUrls: MockInstance<typeof URL.createObjectURL> | undefined;

/**
 * The authored board is a lazy chunk that rasterises its artwork into an SVG object URL once it mounts.
 * That URL is the one sign the chunk loaded and drew, since the board itself is pixels on the canvas.
 */
export const AuthoredArrakis = meta.story({
  parameters: { chromatic: { disableSnapshot: true } },
  args: { presentation: 'play', board: arrakisBoardCapture },
  beforeEach: () => {
    objectUrls = spyOn(URL, 'createObjectURL');
    return () => objectUrls?.mockRestore();
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('img', { name: 'Game table' })).resolves.toBeInTheDocument();
    await waitFor(() => expect(objectUrls).toHaveBeenCalledWith(expect.objectContaining({ type: 'image/svg+xml' })));
    await expect(page.queryByRole('alert')).toBeNull();
  },
});

export const CurvesAndIsland = meta.story({ args: { presentation: 'play', board: curvedBoard() } });

/*
 * Board skins: each viewer's own look for the territory types (sand, rock, strongholds, the Polar Sink).
 * A skin shades the colours the map already has and raises a lit relief; it adds no hue, and dark ink keeps its contrast.
 */
/** The board as it draws today. */
export const SkinNone = meta.story({
  parameters: { chromatic: { disableSnapshot: true } },
  args: { presentation: 'play', board: arrakisBoardCapture, skin: 'none' },
});
/** The board as it draws today with planet shading. */
export const SkinNonePlanet = meta.story({
  parameters: { chromatic: { disableSnapshot: true } },
  args: { presentation: 'play', board: arrakisBoardCapture, skin: 'none', planet: true },
});
/** GF9's printed board: stone-grained parchment, each territory darkening toward its borders. */
export const SkinGf9 = meta.story({
  parameters: { chromatic: { disableSnapshot: true } },
  args: { presentation: 'play', board: arrakisBoardCapture, skin: 'gf9' },
});
/** GF9's printed board with planet shading. */
export const SkinGf9Planet = meta.story({
  parameters: { chromatic: { disableSnapshot: true } },
  args: { presentation: 'play', board: arrakisBoardCapture, skin: 'gf9', planet: true },
});
/** A painted relief map: dunes settling against the rock, lit cliffs onto rock plateaus, walled cities, sunken cracked ice. */
export const SkinFancy = meta.story({
  parameters: { chromatic: { disableSnapshot: true } },
  args: { presentation: 'play', board: arrakisBoardCapture, skin: 'fancy' },
});
/** A painted relief map with planet shading. */
export const SkinFancyPlanet = meta.story({
  parameters: { chromatic: { disableSnapshot: true } },
  args: { presentation: 'play', board: arrakisBoardCapture, skin: 'fancy', planet: true },
});
/** treachery.online's map: lit turbulence, pillowy sand and craggy rock. */
export const SkinTreachery = meta.story({
  parameters: { chromatic: { disableSnapshot: true } },
  args: { presentation: 'play', board: arrakisBoardCapture, skin: 'treachery' },
});
/** treachery.online's map with planet shading. */
export const SkinTreacheryPlanet = meta.story({
  parameters: { chromatic: { disableSnapshot: true } },
  args: { presentation: 'play', board: arrakisBoardCapture, skin: 'treachery', planet: true },
});
