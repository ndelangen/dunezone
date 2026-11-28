import { fn } from 'storybook/test';

import { panelMeta } from '../PanelFrame.stories.fixture';
import { PANEL_INFO } from '../panelInfo';
import { ReplayPanel } from './ReplayPanel';
import type { ReplayPanelProps } from './ReplayPanel';

export const replayPanelMeta = {
  ...panelMeta(PANEL_INFO.replay),
  component: ReplayPanel,
  args: {
    replay: { kind: 'live', canStart: true },
    pending: false,
    onStep: fn(),
    onLive: fn(),
  } satisfies ReplayPanelProps,
};
