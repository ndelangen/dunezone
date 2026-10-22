import preview from '@sb/preview';
import { useArgs } from 'storybook/preview-api';

import { FaqControlsPrototype } from './faqControlsPrototypes.stories.fixture';
import type { FaqControlVariant } from './faqControlsPrototypes.stories.fixture';

const meta = preview.meta({
  title: 'FAQ detail/Controls prototypes',
  component: FaqControlsPrototype,
  parameters: {
    layout: 'fullscreen',
    controls: { disable: true },
    docs: {
      description: {
        component:
          'Three throwaway control prototypes on the approved forum layout. Illustrative discussion and local state only. Edit, save, cancel, accept and hold-to-delete work without changing application records.',
      },
    },
  },
  globals: { motion: 'reduce', backgrounds: { value: undefined, grid: false } },
  args: { variant: 'A' as FaqControlVariant, switcher: false as boolean },
  render: function Render(args) {
    const [, updateArgs] = useArgs();
    return <FaqControlsPrototype {...args} onVariantChange={(variant: FaqControlVariant) => updateArgs({ variant })} />;
  },
});

export const Comparison = meta.story({ args: { switcher: true } });
export const APostHeader = meta.story({ args: { variant: 'A' } });
export const BAcceptAndMenu = meta.story({ args: { variant: 'B' } });
export const CInlineTools = meta.story({ args: { variant: 'C' } });
export const APhone = meta.story({ args: { variant: 'A' }, globals: { viewport: { value: 'appMobileNarrow' } } });
export const BPhone = meta.story({ args: { variant: 'B' }, globals: { viewport: { value: 'appMobileNarrow' } } });
export const CPhone = meta.story({ args: { variant: 'C' }, globals: { viewport: { value: 'appMobileNarrow' } } });
