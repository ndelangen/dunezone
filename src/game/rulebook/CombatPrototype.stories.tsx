import preview from '@sb/preview';
import { expect } from 'storybook/test';

import { CombatPrototype } from './CombatPrototype.stories.fixture';

const meta = preview.meta({
  title: 'Prototypes/Combat chapter',
  component: CombatPrototype,
  args: { variant: 'comic', page: 0 },
  argTypes: {
    page: {
      control: { type: 'range', min: 0, max: 9, step: 1 },
      description: '0 shows the whole chapter. Select a page for closer inspection.',
    },
  },
  parameters: { layout: 'fullscreen' },
  play: async ({ canvasElement }) => {
    await document.fonts.ready;
    const preparation = canvasElement.querySelector('[data-rulebook-page-id="prepare"]');
    if (preparation) {
      const steps = [...preparation.querySelectorAll('.rulebookBattleScene')];
      expect(steps).toHaveLength(3);
      const expectedHeading = getComputedStyle(steps[0]!.querySelector('h3')!);
      const gaps = steps
        .slice(1)
        .map((step, index) => step.getBoundingClientRect().top - steps[index]!.getBoundingClientRect().bottom);
      expect(gaps[0]).toBeGreaterThan(10);
      expect(Math.abs(gaps[0]! - gaps[1]!)).toBeLessThan(1);
      for (const step of steps) {
        const visual = step.querySelector('.rulebookBattleVisual')!.getBoundingClientRect();
        const narrative = step.querySelector('.rulebookBattleNarrative')!.getBoundingClientRect();
        expect(visual.left).toBeGreaterThanOrEqual(narrative.right);
        expect(visual.top).toBe(narrative.top);
        const heading = getComputedStyle(step.querySelector('h3')!);
        expect(heading.fontFamily).toBe(expectedHeading.fontFamily);
        expect(heading.fontSize).toBe(expectedHeading.fontSize);
        expect(heading.lineHeight).toBe(expectedHeading.lineHeight);
        expect(narrative.left).toBe(steps[0]!.getBoundingClientRect().left);
      }
    }
    for (const region of canvasElement.querySelectorAll<HTMLElement>('[data-rulebook-region]')) {
      const bounds = region.getBoundingClientRect();
      const content = region.querySelector('.rulebookRegionBlocks')!.getBoundingClientRect();
      expect(
        content.bottom,
        `Content fits the ${region.getAttribute('data-rulebook-region')} region`
      ).toBeLessThanOrEqual(bounds.bottom + 1);
      expect(content.right).toBeLessThanOrEqual(bounds.right + 1);
    }
  },
});
export const CompactComic = meta.story({ name: 'A · Compact comic', args: { variant: 'comic' } });
export const GuidedLesson = meta.story({ name: 'B · Guided lesson', args: { variant: 'lesson' } });
export const BattleTable = meta.story({ name: 'C · Battle table', args: { variant: 'table' } });
