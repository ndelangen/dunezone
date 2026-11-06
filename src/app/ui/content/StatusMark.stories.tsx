import { Group } from '@mantine/core';
import preview from '@sb/preview';
import { waitForFrame } from '@sb/storyWaits';
import { CircleAlert, CircleCheck, CircleDashed, History, RefreshCw } from 'lucide-react';
import { expect, userEvent, within } from 'storybook/test';

import { StatusMark } from './StatusMark';

const meta = preview.meta({
  component: StatusMark,
  parameters: { layout: 'centered' },
  args: {
    icon: <CircleCheck size={16} aria-hidden />,
    label: 'No unsaved changes',
  },
});

async function tabAfterClosingCopies(doc: Document) {
  /* Simulated Tab includes inert buttons, so a previous story's closing copy must leave first. */
  await waitForFrame(() => expect(doc.querySelector('[data-closing]')).toBeNull());
  await userEvent.tab();
}

/**
 * A state with no charge: nothing to save.
 * Tabbing to the glyph opens its tooltip, which is how a keyboard reader gets the words a pointer gets on hover.
 */
export const Neutral = meta.story({
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await tabAfterClosingCopies(canvasElement.ownerDocument);
    await expect(page.getByRole('img', { name: 'No unsaved changes' })).toHaveFocus();
    await expect(waitForFrame(() => page.getByRole('tooltip'))).resolves.toHaveTextContent('No unsaved changes');
  },
});

/**
 * Every tone beside Neutral, so the glyph colours can be compared.
 * Caution warns without failing;
 * pending waits on something else to start;
 * progress is underway right now.
 */
export const Tones = meta.story({
  render: () => (
    <Group gap="xs">
      <StatusMark icon={<CircleCheck size={16} aria-hidden />} label="No unsaved changes" />
      <StatusMark tone="caution" icon={<CircleDashed size={16} aria-hidden />} label="Unsaved changes" />
      <StatusMark tone="negative" icon={<CircleAlert size={16} aria-hidden />} label="Save failed" />
      <StatusMark tone="positive" icon={<CircleCheck size={16} aria-hidden />} label="Saved" />
      <StatusMark
        tone="pending"
        icon={<History size={16} aria-hidden />}
        label="A new faction sheet capture is scheduled. The current PDF remains available."
      />
      <StatusMark
        tone="progress"
        icon={<RefreshCw size={16} aria-hidden />}
        label="A new faction sheet capture is in progress. The current PDF remains available."
      />
    </Group>
  ),
});
