import preview from '@sb/preview';
import { EXAMPLE_HOMEWORLD_CARD } from '@shared/assets/homeworldTemplate';
import { expect, waitFor, within } from 'storybook/test';

import { HomeworldCard } from './Homeworld';

const meta = preview.meta({
  component: HomeworldCard,
  globals: { viewport: { value: 'card' } },
  args: EXAMPLE_HOMEWORLD_CARD,
});

export const Pelagos = meta.story({
  play: async ({ canvasElement }) => {
    await document.fonts.ready;
    const sections = canvasElement.querySelectorAll('section');
    await expect(sections).toHaveLength(3);
    await expect(sections[0]).toHaveTextContent('6 or more forces');
    await expect(sections[1]).toHaveTextContent('0 to 5 forces');
    await expect(canvasElement.querySelector('[aria-label="High reserves strength 3"]')).toBeVisible();
    await expect(canvasElement.querySelector('[aria-label="Low reserves strength 1"]')).toBeVisible();
    await expect(canvasElement.querySelector('[aria-label="Homeworld"]')).toBeNull();
    const title = canvasElement.querySelector('[aria-label="Pelagos"]')!;
    for (const section of sections) {
      const rules = section.querySelector('[data-card-effect-text]')!;
      const heading = within(section).getByText(section.ariaLabel!, { exact: true });
      await expect(Math.abs(rules.getBoundingClientRect().left - title.getBoundingClientRect().left)).toBeLessThan(1);
      await expect(Math.abs(heading.getBoundingClientRect().left - title.getBoundingClientRect().left)).toBeLessThan(1);
    }
    await expect(sections[0]!.getBoundingClientRect().top - title.getBoundingClientRect().bottom).toBeLessThan(60);
  },
});
export const RingedPlanet = meta.story({
  args: { icon: [EXAMPLE_HOMEWORLD_CARD.icon[0], '/image/planet/06.png'], iconScale: 1.3 },
});
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
