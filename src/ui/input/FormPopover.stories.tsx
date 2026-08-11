import { Button } from '@mantine/core';
import { legacyStoryParameters } from '@sb/legacyStoryParameters';
import preview from '@sb/preview';

import { FormPopover } from './FormPopover';

const meta = preview.meta({
  component: FormPopover,
  parameters: legacyStoryParameters,
});

export const Default = meta.story({
  args: {
    trigger: (
      <Button variant="light" color="dune" type="button">
        Open popover
      </Button>
    ),
    children: (
      <div style={{ maxWidth: 260 }}>
        <p style={{ marginBottom: 8 }}>Shared popover surface for small forms or previews.</p>
        <p style={{ margin: 0 }}>Use form primitives inside to keep UX consistent.</p>
      </div>
    ),
  },
});
