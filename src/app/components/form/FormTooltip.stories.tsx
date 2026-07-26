import { legacyStoryParameters } from '@sb/legacyStoryParameters';
import preview from '@sb/preview';

import { UIButton } from '@app/components/generic/ui/UIButton';

import { FormTooltip } from './FormTooltip';

const meta = preview.meta({
  component: FormTooltip,
  parameters: legacyStoryParameters,
});

export const Default = meta.story({
  args: {
    content: 'Helpful description for this action.',
    children: (
      <UIButton type="button" iconOnly={false}>
        Hover me
      </UIButton>
    ),
  },
});
