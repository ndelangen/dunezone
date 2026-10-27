import type { GameSnapshot, Viewer } from '@shared/play/protocol';
import type { Decorator } from '@storybook/tanstack-react';

import { storedProjection } from '../../../../db/tabletop/tableProjection';
import type { TableProjection } from '../../../../db/tabletop/TableSession';
import compass from '../compass/CompassControls.module.css';
import { WindowFrame } from '../compass/WindowFrame';
import { DarkSchemeIsland } from '../DarkSchemeIsland';
import type { PanelWindow } from './panelWindows';
import '../dune-play.css';

/** Where a panel story frames its panel: a pinned slot at its default height, or the centre window the compass opens. */
type PanelFrame = 'slot' | 'centre';

/* A pinned slot's default height, as the compass first gives it. */
const SLOT_HEIGHT = 448;

/**
 * A panel story's frame: the panel in its own window, on the table's dark ground, as the compass shows it, without the table.
 * The window's name, glyph and (?) come from the same entry the table installs, so the story is the window a player sees.
 * A story frames the panel in the centre with the `panelFrame` parameter, or in another window that shows it with `panelWindow`.
 */
export function panelMeta(window: PanelWindow) {
  const frame: Decorator = (Story, { parameters }) => {
    const where = (parameters.panelFrame as PanelFrame | undefined) ?? 'slot';
    const shown = (parameters.panelWindow as PanelWindow | undefined) ?? window;
    return (
      <DarkSchemeIsland>
        <div className="dune-play-shell" style={{ height: '100vh' }}>
          <div className={compass.root}>
            <WindowFrame
              entry={{
                ...shown,
                group: '',
                content: <Story />,
                layout: shown.fill ? 'fill' : shown.padding === false ? 'flush' : 'stack',
              }}
              where={where === 'slot' ? 'left' : 'centre'}
              inert={false}
              style={where === 'slot' ? { height: SLOT_HEIGHT } : undefined}
              onSeat={() => {}}
              onFaction={() => {}}
              actions={null}
            />
          </div>
        </div>
      </DarkSchemeIsland>
    );
  };
  return { decorators: [frame], parameters: { layout: 'fullscreen' } };
}

/**
 * The table a panel reads, as a seat sees it in a live game: built from a product snapshot, so a panel's story data is what the table would hand that panel.
 * `overrides` sets what the story is about, such as a lost connection.
 */
export function tableOf(
  snapshot: GameSnapshot,
  viewerSeat: Viewer['viewerSeat'] = 'seat-2',
  overrides: Partial<TableProjection> = {}
): TableProjection {
  const viewer: Viewer = {
    connectionId: 'story-connection',
    userId: 'story-user',
    displayName: snapshot.controls?.players.find((player) => player.seat === viewerSeat)?.name ?? 'Klyzx',
    viewerSeat,
    color: '#ed927c',
  };
  const stored = storedProjection({ viewer, snapshot, serverNow: 0, pending: [] });
  return { ...stored, canInteract: true, canHandleTable: true, reconnecting: false, ...overrides };
}
