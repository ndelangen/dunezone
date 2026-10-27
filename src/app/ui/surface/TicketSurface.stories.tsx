import { Button, Stack, Text, Title } from '@mantine/core';
import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

import { TicketLayout } from '../layout/TicketLayout';
import { TicketMain, TicketStub, TicketSurface } from './TicketSurface';

/* A ticket as the create page sets one: the paper round a TicketLayout, the main part and the stub in its slots. */
const parts = (
  <TicketLayout>
    <TicketLayout.Main>
      <TicketMain>
        <Stack gap="md">
          <Text size="xs" fw={800} tt="uppercase" c="dimmed">
            This will be the name of your game
          </Text>
          <Title order={2}>Arrakeen picnic</Title>
          <Text>The main part holds what the ticket is for, on the app’s paper.</Text>
        </Stack>
      </TicketMain>
    </TicketLayout.Main>
    <TicketLayout.Stub>
      <TicketStub>
        <Stack gap="md">
          <Text>The stub sits on the table’s dark ground, past the perforation.</Text>
          <Button fullWidth>Create game</Button>
        </Stack>
      </TicketStub>
    </TicketLayout.Stub>
  </TicketLayout>
);

const meta = preview.meta({
  component: TicketSurface,
  parameters: { layout: 'padded' },
  args: { children: parts },
});

/** The main part on the paper, the stub on the dark ground, side by side with the perforation between them. */
export const Ticket = meta.story({
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'Create game' }).closest('[data-scheme-dark]')).not.toBeNull();
    await expect(canvas.getByText('Arrakeen picnic').closest('[data-scheme-dark]')).toBeNull();
  },
});
