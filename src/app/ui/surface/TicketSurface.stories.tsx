import { Button, Stack, Text, Title } from '@mantine/core';
import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

import { TicketSurface } from './TicketSurface';

/* The ticket lays its parts side by side by the page frame's width, as it does inside PageLayout. */
const meta = preview.meta({
  component: TicketSurface,
  parameters: { layout: 'padded' },
  decorators: [(Story) => <div style={{ containerType: 'inline-size', containerName: 'page-frame' }}>{Story()}</div>],
  args: {
    main: (
      <Stack gap="md">
        <Text size="xs" fw={800} tt="uppercase" c="dimmed">
          This will be the name of your game
        </Text>
        <Title order={2}>Arrakeen picnic</Title>
        <Text>The main part holds what the ticket is for, on the app’s paper.</Text>
      </Stack>
    ),
    stub: (
      <Stack gap="md">
        <Text>The stub sits on the table’s dark ground, past the perforation.</Text>
        <Button fullWidth>Create game</Button>
      </Stack>
    ),
  },
});

/** A wide page: the main part and the stub side by side, the perforation between them. */
export const Wide = meta.story({
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const stub = canvas.getByRole('button', { name: 'Create game' }).closest('[data-scheme-dark]');
    await expect(stub).not.toBeNull();
    await expect(canvas.getByText('Arrakeen picnic').closest('[data-scheme-dark]')).toBeNull();
  },
});

/** A narrow page: the stub stacks under the main part. */
export const Narrow = meta.story({
  decorators: [(Story) => <div style={{ maxWidth: '30rem' }}>{Story()}</div>],
});
