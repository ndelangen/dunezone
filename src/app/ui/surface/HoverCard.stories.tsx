import { HoverCard, Text } from '@mantine/core';
import preview from '@sb/preview';
import { expect, userEvent, waitFor, within } from 'storybook/test';

/* Mantine's hover card under our theme: a card that opens over its target on hover or keyboard focus, and stays while the pointer moves into it. */
const meta = preview.meta({
  title: 'Hover Card',
  component: HoverCard,
  parameters: { layout: 'centered' },
  render: (args) => (
    <HoverCard {...args} withinPortal shadow="md">
      <HoverCard.Target>
        <Text span td="underline">
          Arrakeen
        </Text>
      </HoverCard.Target>
      <HoverCard.Dropdown>
        <Text size="sm">The capital of Arrakis.</Text>
      </HoverCard.Dropdown>
    </HoverCard>
  ),
});

/** Hovering the target opens the card. */
export const OnHover = meta.story({
  play: async ({ canvas }) => {
    await userEvent.hover(canvas.getByText('Arrakeen'));
    const card = await within(document.body).findByText('The capital of Arrakis.');
    await waitFor(() => expect(card).toBeVisible());
  },
});
