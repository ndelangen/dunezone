import preview from '@sb/preview';

import { NarrowPrototypeComparison } from './FaqListNarrowPrototypes.stories.fixture';

const meta = preview.meta({
  title: 'FaqList Narrow Prototypes',
  component: NarrowPrototypeComparison,
  parameters: { layout: 'padded' },
  globals: { backgrounds: { value: 'light' } },
});

export const Comparison = meta.story({ args: { initialWidth: '320' } });
export const At400 = meta.story({ args: { initialWidth: '400' } });
