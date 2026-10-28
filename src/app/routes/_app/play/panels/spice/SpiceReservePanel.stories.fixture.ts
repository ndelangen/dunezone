import { fn } from 'storybook/test';

import { panelMeta } from '../PanelWindow.stories.fixture';
import { PANEL_WINDOWS } from '../panelWindows';
import { SpiceReservePanel } from './SpiceReservePanel';
import type { SpiceReservePanelProps } from './SpiceReservePanel';

export const spiceReservePanelMeta = {
  ...panelMeta(PANEL_WINDOWS.spice),
  component: SpiceReservePanel,
  args: {
    balance: 37,
    enabled: true,
    hiddenHeading: true,
    onWithdraw: fn((_amount: number) => true),
  } satisfies SpiceReservePanelProps,
};
