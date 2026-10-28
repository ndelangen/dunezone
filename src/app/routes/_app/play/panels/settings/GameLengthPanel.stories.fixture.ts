import { lastTurnOf } from '@shared/play/lastTurn';
import { fn } from 'storybook/test';

import { playingSnapshot } from '../../product.stories.fixture';
import { panelMeta } from '../PanelWindow.stories.fixture';
import { PANEL_WINDOWS } from '../panelWindows';
import { GameLengthPanel } from './GameLengthPanel';
import type { GameLengthPanelProps } from './GameLengthPanel';

export const gameLengthPanelMeta = {
  ...panelMeta(PANEL_WINDOWS.settings),
  component: GameLengthPanel,
  args: { lastTurn: lastTurnOf(playingSnapshot()), disabled: false, onLastTurn: fn() } satisfies GameLengthPanelProps,
};
