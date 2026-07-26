import { legacyStoryParameters } from '@sb/legacyStoryParameters';
import preview from '@sb/preview';

import { UIButton } from '@app/components/generic/ui/UIButton';

import { FormPopover } from './FormPopover';

const meta = preview.meta({
  component: FormPopover,
  parameters: legacyStoryParameters,
});

export const Default = meta.story({
  args: {
    trigger: (
      <UIButton type="button" variant="secondary" iconOnly={false}>
        Open popover
      </UIButton>
    ),
    children: (
      <div style={{ maxWidth: 260 }}>
        <p style={{ marginBottom: 8 }}>Shared popover surface for small forms or previews.</p>
        <p style={{ margin: 0 }}>Use form primitives inside to keep UX consistent.</p>
      </div>
    ),
  },
});
