import { getRulebookSize } from '@shared/rulebooks/settings';
import type { RulebookSize } from '@shared/rulebooks/settings';
import { expect } from 'storybook/test';

import { expectContained } from './RulebookCardGuides.shared.stories.fixture';

export async function expectFanContained(context: { canvasElement: HTMLElement }) {
  await expectContained(context);
  const page = context.canvasElement.querySelector<HTMLElement>('[data-rulebook-page]')!;
  const fan = context.canvasElement.querySelector('.rulebookCardFan')!.getBoundingClientRect();
  // The source shadow extends beyond the transformed card's border box.
  const shadow =
    (page.getBoundingClientRect().width / getRulebookSize(page.dataset.rulebookSize as RulebookSize).widthMm) * 4;
  for (const image of context.canvasElement.querySelectorAll('.rulebookCardFan img')) {
    const bounds = image.getBoundingClientRect();
    await expect(bounds.left - shadow).toBeGreaterThanOrEqual(fan.left - 1);
    await expect(bounds.right + shadow).toBeLessThanOrEqual(fan.right + 1);
    await expect(bounds.top - shadow).toBeGreaterThanOrEqual(fan.top - 1);
    await expect(bounds.bottom + shadow).toBeLessThanOrEqual(fan.bottom + 1);
  }
}
