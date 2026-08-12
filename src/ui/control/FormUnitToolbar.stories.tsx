import { ActionIcon } from '@mantine/core';
import preview from '@sb/preview';
import { Trash2 } from 'lucide-react';

import { FormUnitToolbar } from './FormUnitToolbar';

const meta = preview.meta({
  component: FormUnitToolbar,
});

export const Default = meta.story({
  args: {
    leading: <span>Item A</span>,
    center: <span>Unit toolbar center text</span>,
    actions: (
      <ActionIcon variant="light" color="red" size="lg" type="button" aria-label="Remove item">
        <Trash2 size={16} aria-hidden />
      </ActionIcon>
    ),
  },
});
