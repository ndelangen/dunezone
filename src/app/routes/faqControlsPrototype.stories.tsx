import preview from '@sb/preview';

import { FaqControlsPrototype } from './faqControlsPrototype.stories.fixture';

const meta = preview.meta({
  title: 'FAQ detail/Controls prototype',
  component: FaqControlsPrototype,
  parameters: {
    layout: 'fullscreen',
    controls: { disable: true },
    docs: {
      description: {
        component:
          'The selected FAQ controls prototype. Accept an answer only while none is accepted. The question owner can unmark the accepted answer through its menu before choosing another. All changes live in preview memory.',
      },
    },
  },
  globals: { motion: 'reduce', backgrounds: { value: undefined, grid: false } },
});

export const Preview = meta.story({});
export const Phone = meta.story({ globals: { viewport: { value: 'appMobileNarrow' } } });
