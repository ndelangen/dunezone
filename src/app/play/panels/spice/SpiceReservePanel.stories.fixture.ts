import { createElement } from 'react';
import { fn } from 'storybook/test';

import { panelMeta } from '../PanelFrame.stories.fixture';
import { PANEL_INFO } from '../panelInfo';
import { SpiceReservePanel } from './SpiceReservePanel';
import type { SpiceReservePanelProps } from './SpiceReservePanel';

export const spiceReservePanelMeta = {
  ...panelMeta(PANEL_INFO.spice),
  component: SpiceReservePanel,
  render: (args: Extract<SpiceReservePanelProps, { isFrozen?: false }>) => createElement(SpiceReservePanel, args),
  args: {
    isFrozen: false,
    balance: 37,
    enabled: true,
    hiddenHeading: true,
    onStartPlacement: fn(),
    onWithdraw: fn((_amount: number) => true),
  } satisfies SpiceReservePanelProps,
};
