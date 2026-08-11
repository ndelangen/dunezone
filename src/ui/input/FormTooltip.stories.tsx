import { Button } from '@mantine/core';
import { legacyStoryParameters } from '@sb/legacyStoryParameters';
import preview from '@sb/preview';

import { FormTooltip } from './FormTooltip';

const meta = preview.meta({
  component: FormTooltip,
  parameters: legacyStoryParameters,
});

export const Default = meta.story({
  args: {
    content: 'Helpful description for this action.',
    children: (
      <Button variant="filled" color="confirm" type="button">
        Hover me
      </Button>
    ),
  },
});
