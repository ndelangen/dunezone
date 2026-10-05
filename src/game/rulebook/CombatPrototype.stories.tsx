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
