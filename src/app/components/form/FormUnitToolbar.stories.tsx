import { legacyStoryParameters } from '@sb/legacyStoryParameters';
import preview from '@sb/preview';
import { Trash2 } from 'lucide-react';

import { UIButton } from '@app/components/generic/ui/UIButton';

import { FormUnitToolbar } from './FormUnitToolbar';

const meta = preview.meta({
  component: FormUnitToolbar,
  parameters: legacyStoryParameters,
});

export const Default = meta.story({
  args: {
    leading: <span>Item A</span>,
    center: <span>Unit toolbar center text</span>,
    actions: (
      <UIButton type="button" variant="critical" iconOnly aria-label="Remove item">
        <Trash2 size={16} aria-hidden />
      </UIButton>
    ),
  },
});
