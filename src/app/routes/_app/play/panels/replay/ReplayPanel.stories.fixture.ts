import { fn } from 'storybook/test';

import { panelMeta } from '../PanelWindow.stories.fixture';
import { PANEL_WINDOWS } from '../panelWindows';
import { ReplayPanel } from './ReplayPanel';
import type { ReplayPanelProps } from './ReplayPanel';

export const replayPanelMeta = {
  ...panelMeta(PANEL_WINDOWS.replay),
  component: ReplayPanel,
  args: {
    replay: { kind: 'live', canStart: true },
    pending: false,
    onStep: fn(),
    onLive: fn(),
  } satisfies ReplayPanelProps,
};
