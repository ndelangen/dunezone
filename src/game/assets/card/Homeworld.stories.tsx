import preview from '@sb/preview';
import { EXAMPLE_HOMEWORLD_CARD } from '@shared/assets/homeworldTemplate';
import { expect, waitFor } from 'storybook/test';

import { HomeworldCard } from './Homeworld';

const meta = preview.meta({
  component: HomeworldCard,
  globals: { viewport: { value: 'card' } },
  args: EXAMPLE_HOMEWORLD_CARD,
});

export const Pelagos = meta.story({
  play: async ({ canvasElement }) => {
    const sections = canvasElement.querySelectorAll('section');
    await expect(sections).toHaveLength(3);
    await expect(sections[0]).toHaveTextContent('6 or more forces');
    await expect(sections[1]).toHaveTextContent('0 to 5 forces');
    await expect(canvasElement.querySelector('[aria-label="High reserves strength 3"]')).toBeVisible();
    await expect(canvasElement.querySelector('[aria-label="Low reserves strength 1"]')).toBeVisible();
  },
});

export const SharedStrength = meta.story({
  args: { high: { ...EXAMPLE_HOMEWORLD_CARD.high, strength: 2 }, low: { ...EXAMPLE_HOMEWORLD_CARD.low, strength: 2 } },
});
export const SingleForceThreshold = meta.story({ args: { threshold: 1 } });
export const LongEffects = meta.story({
  args: {
    high: { strength: 9, text: 'Long rules text with several words. '.repeat(11) },
    low: { strength: 0, text: 'W'.repeat(400) },
    occupied: '沙漠'.repeat(200),
  },
  play: async ({ canvasElement }) => {
    await document.fonts.ready;
    for (const section of canvasElement.querySelectorAll('section')) {
      await waitFor(async () => {
        const rules = section.querySelector<HTMLElement>('[data-card-effect-text]')!;
        await expect(rules.scrollWidth).toBeLessThanOrEqual(rules.clientWidth + 1);
        await expect(section.getBoundingClientRect().bottom).toBeLessThanOrEqual(
          section.parentElement!.getBoundingClientRect().bottom + 1
        );
      });
    }
  },
});
