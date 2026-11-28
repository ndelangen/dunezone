import { lastTurnOf } from '@shared/play/lastTurn';
import { fn } from 'storybook/test';

import { playingSnapshot } from '../../../routes/_app/play/product.stories.fixture';
import { panelMeta } from '../PanelFrame.stories.fixture';
import { PANEL_INFO } from '../panelInfo';
import { GameLengthPanel } from './GameLengthPanel';
import type { GameLengthPanelProps } from './GameLengthPanel';

export const gameLengthPanelMeta = {
  ...panelMeta(PANEL_INFO.settings),
  component: GameLengthPanel,
  args: {
    lastTurn: lastTurnOf(playingSnapshot()),
    disabled: false,
    observing: false,
    onLastTurn: fn(),
  } satisfies GameLengthPanelProps,
};
