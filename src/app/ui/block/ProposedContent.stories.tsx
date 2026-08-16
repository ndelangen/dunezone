import { Text } from '@mantine/core';
import preview from '@sb/preview';

import { ProposedContent } from './ProposedContent';

const meta = preview.meta({
  component: ProposedContent,
  parameters: { layout: 'padded' },
  args: {
    label: 'Proposed content · page query required',
    children: (
      <Text size="sm" c="dimmed">
        Rulesets owned or maintained by this contributor would appear here.
      </Text>
    ),
  },
  argTypes: { children: { control: false } },
});

/**
 * The badge is the whole component: without it, prose describing a feature that does not exist reads as a statement about the record on screen.
 */
export const Default = meta.story({});

/** The label carries the reason, so it can name what the region is waiting on. */
export const NamesWhatIsMissing = meta.story({
  args: {
    label: 'Proposed content · awaiting publication pipeline',
    children: (
      <Text size="sm" c="dimmed">
        Published sheet downloads will be listed here once capture is scheduled per faction.
      </Text>
    ),
  },
});
