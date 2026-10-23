import { within } from 'storybook/test';

import { LayoutSlotPlaceholder } from './LayoutSlotPlaceholder.stories.fixture';
import { SplitPanels } from './SplitPanels';
import type { SplitLimits } from './SplitPanels';

export const EVEN_LIMITS: SplitLimits = { min: 28, max: 72 };
export const evenLimits = () => EVEN_LIMITS;

export const panels = [
  <SplitPanels.First key="first">
    <LayoutSlotPlaceholder name="first" tone="primary" minHeight={0} />
  </SplitPanels.First>,
  <SplitPanels.Second key="second">
    <LayoutSlotPlaceholder name="second" tone="secondary" minHeight={0} />
  </SplitPanels.Second>,
];

export function separatorOf(canvasElement: HTMLElement) {
  return within(canvasElement).getByRole('separator');
}

export function sizeOf(separator: HTMLElement) {
  return Number(separator.getAttribute('aria-valuenow'));
}
