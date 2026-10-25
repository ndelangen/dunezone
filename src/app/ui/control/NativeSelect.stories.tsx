import { NativeSelect } from '@mantine/core';
import preview from '@sb/preview';

const meta = preview.meta({
  component: NativeSelect,
  parameters: { layout: 'padded' },
  args: { label: 'Reference type', data: ['Treachery cards', 'Factions', 'Boards'] },
});

export const Default = meta.story({});
