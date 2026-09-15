import { Button, Group, Text } from '@mantine/core';
import preview from '@sb/preview';

import { CalloutSurface } from './CalloutSurface';

const meta = preview.meta({ component: CalloutSurface });
export const Actions = meta.story({
  args: {
    children: <Text ta="center">Two players are preparing.</Text>,
    actions: (
      <Group justify="space-between">
        <Button variant="default">Cancel</Button>
        <Button>Ready</Button>
      </Group>
    ),
  },
});
