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
      expect(steps).toHaveLength(2);
      const first = steps[0]!.getBoundingClientRect();
      const next = steps[1]!.getBoundingClientRect();
      expect(next.top).toBeGreaterThanOrEqual(first.bottom);
      expect(next.left).toBe(first.left);
      for (const step of steps) {
        const visual = step.firstElementChild!.getBoundingClientRect();
        const narrative = step.querySelector('.rulebookBattleNarrative')!.getBoundingClientRect();
        expect(narrative.left).toBeGreaterThanOrEqual(visual.right);
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
