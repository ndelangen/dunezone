import preview from '@sb/preview';

import { CombatPrototype } from './CombatPrototype.stories.fixture';

const meta = preview.meta({
  title: 'Prototypes/Combat chapter',
  component: CombatPrototype,
  args: { variant: 'comic', page: 0 },
  argTypes: {
    page: {
      control: { type: 'range', min: 0, max: 8, step: 1 },
      description: '0 shows the whole chapter. Select a page for closer inspection.',
    },
  },
  parameters: { layout: 'fullscreen' },
});
export const CompactComic = meta.story({ name: 'A · Compact comic', args: { variant: 'comic' } });
export const GuidedLesson = meta.story({ name: 'B · Guided lesson', args: { variant: 'lesson' } });
export const BattleTable = meta.story({ name: 'C · Battle table', args: { variant: 'table' } });
