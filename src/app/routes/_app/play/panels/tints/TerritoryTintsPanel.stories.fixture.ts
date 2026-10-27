import type { GameSnapshot } from '@shared/play/protocol';
import { fn } from 'storybook/test';

import { playingSnapshot } from '../../product.stories.fixture';
import { panelMeta, tableOf } from '../PanelWindow.stories.fixture';
import { PANEL_WINDOWS } from '../panelWindows';
import { TerritoryTintsPanel } from './TerritoryTintsPanel';
import type { TerritoryTintsPanelProps } from './TerritoryTintsPanel';
import { tintPresets, tintRows } from './useTerritoryTintsPanel';

const VIEWER = 'seat-2';

/** Mid-game with the two presets laid: the Fremen deployment across the deep desert, and the Shield Wall destroyed. */
export function tintedSnapshot(): GameSnapshot {
  return {
    ...playingSnapshot(VIEWER),
    bank: { factionId: 'house-harkonnen', balance: 0 },
    tints: [
      {
        id: 'tint-fremen',
        name: 'Fremen deployment',
        color: '#2b5ea7',
        territories: [
          'the_great_flat',
          'the_greater_flat',
          'wind_pass',
          'plastic_basin',
          'funeral_plain',
          'habbanya_erg',
          'false_wall_west',
          'cielago_west',
          'hagga_basin',
          'wind_pass_north',
          'polar_sink',
          'tsimpo',
          'broken_land',
          'rock_outcroppings',
          'bight_of_the_cliff',
          'tabr',
        ],
      },
      {
        id: 'tint-shield',
        name: 'Shield Wall destroyed',
        color: '#1b1b1b',
        territories: ['shield_wall'],
      },
    ],
  };
}

/** The panel's props as the table hands them for this snapshot, with spied commands; `painting` names the tint whose paintbrush is on. */
export function tintsProps(snapshot: GameSnapshot = tintedSnapshot(), painting?: string): TerritoryTintsPanelProps {
  const table = tableOf(snapshot, VIEWER);
  return {
    rows: tintRows(table, painting),
    canEdit: true,
    canCreate: true,
    presets: tintPresets(table),
    onCreate: fn(),
    onBrush: fn(),
    onSet: fn(),
    onColor: fn(),
    onRemove: fn(),
  };
}

/** A table with no tints yet. */
export function untintedSnapshot(): GameSnapshot {
  return { ...playingSnapshot(VIEWER), bank: { factionId: 'house-harkonnen', balance: 0 } };
}

export const tintsPanelMeta = {
  ...panelMeta(PANEL_WINDOWS.tints),
  component: TerritoryTintsPanel,
  args: tintsProps(),
};
