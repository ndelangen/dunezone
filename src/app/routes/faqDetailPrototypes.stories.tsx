import preview from '@sb/preview';

import { FaqDetailPrototype } from './faqDetailPrototypes.stories.fixture';

const meta = preview.meta({
  title: 'FAQ detail/Prototypes',
  component: FaqDetailPrototype,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Throwaway FAQ detail layouts. Names, discussions, groups, counts and acceptance dates are illustrative. Game cards use authored fixtures. Each person has one answer that can be updated in place. Related questions share exact references, ordered by overlap count and newest question as the tiebreaker, with five shown. Use the viewport toolbar to compare widths.',
      },
    },
  },
  globals: { motion: 'reduce', backgrounds: { value: undefined, grid: false } },
  args: { variant: 'A', switcher: false },
});

export const Comparison = meta.story({
  args: { switcher: true },
  globals: { viewport: { value: undefined } },
});
export const AReadingRail = meta.story({ args: { variant: 'A' }, globals: { viewport: { value: 'appLarge' } } });
export const BForum = meta.story({ args: { variant: 'B' }, globals: { viewport: { value: 'appLarge' } } });
export const CFieldNotes = meta.story({ args: { variant: 'C' }, globals: { viewport: { value: 'appLarge' } } });
export const APhone = meta.story({ args: { variant: 'A' }, globals: { viewport: { value: 'appMobile' } } });
export const BPhone = meta.story({ args: { variant: 'B' }, globals: { viewport: { value: 'appMobile' } } });
export const CPhone = meta.story({ args: { variant: 'C' }, globals: { viewport: { value: 'appMobile' } } });
export const Tablet = meta.story({
  args: { variant: 'B', switcher: true },
  globals: { viewport: { value: 'appTablet' } },
});
