import { Paper, Text } from '@mantine/core';
import preview from '@sb/preview';

import { PickerField } from './PickerField';

const picker = () => (
  <Paper withBorder p="md">
    <Text size="sm">The caller's picker opens here.</Text>
  </Paper>
);

const meta = preview.meta({
  component: PickerField,
  parameters: { layout: 'padded' },
  globals: { backgrounds: { value: 'dark', grid: false } },
  decorators: [(Story) => <div style={{ maxWidth: '28rem' }}>{Story()}</div>],
  args: {
    title: 'Faction',
    description: "Optional live reference. The heading follows the faction's current colour.",
    chosen: 'Choose faction',
    loadingLabel: 'Loading factions',
    picker,
  },
});

/** Nothing chosen: the button invites a choice and there is nothing to clear. */
export const Empty = meta.story({});

/** A choice made: the button names it and the clear action sits beside it. */
export const Chosen = meta.story({
  args: { chosen: 'House Atreides', onClear: () => undefined },
});

/** The picker open under the button. */
export const Opened = meta.story({
  args: { chosen: 'House Atreides', onClear: () => undefined, opened: true },
});
