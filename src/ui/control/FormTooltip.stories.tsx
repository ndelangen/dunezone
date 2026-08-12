import { Button } from '@mantine/core';
import preview from '@sb/preview';

import { FormTooltip } from './FormTooltip';

const meta = preview.meta({
  component: FormTooltip,
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
