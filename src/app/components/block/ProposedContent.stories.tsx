import { Text } from '@mantine/core';
import preview from '@sb/preview';

import { ProposedContent } from './ProposedContent';

const meta = preview.meta({
  component: ProposedContent,
  parameters: { layout: 'padded' },
  globals: { backgrounds: { value: 'light', grid: false } },
  args: {
    label: 'Proposed content',
    children: (
      <Text size="sm" c="dimmed">
        Printable rules, release notes, and a version history could live here.
      </Text>
    ),
  },
});

/** The badge is the whole component: it keeps roadmap prose from reading as data. */
export const Default = meta.story({});

/** The label names what is missing and why, so `grep ProposedContent` reads as a debt list. */
export const WithBlockingReason = meta.story({
  args: {
    label: 'Proposed content · page query required',
    children: (
      <Text size="sm" c="dimmed">
        Rulesets owned or maintained by this contributor would appear here.
      </Text>
    ),
  },
});
