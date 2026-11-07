import { Group } from '@mantine/core';
import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

import { NameDisc } from './NameDisc';

const AVATAR =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" fill="#c58b2b"/><circle cx="20" cy="16" r="7" fill="#f6e7c8"/><rect x="8" y="26" width="24" height="14" rx="7" fill="#f6e7c8"/></svg>'
  );

const meta = preview.meta({
  component: NameDisc,
  parameters: { layout: 'centered' },
  args: { name: 'Paul Atreides', size: 40 },
});

/** No picture: the initial, one capital letter, sized to the disc. */
export const Initial = meta.story({});

/** With a picture. */
export const Picture = meta.story({ args: { src: AVATAR } });

/** A faction's token, ringed in its colour. */
export const Ringed = meta.story({ args: { name: 'Fremen', ring: '#d8a03a' } });

/** Named for readers when no name is written beside it. */
export const Labelled = meta.story({
  args: { label: 'Paul Atreides' },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('img', { name: 'Paul Atreides' })).toBeVisible();
  },
});

/** Every size keeps one legible letter, from a chat line up to a walkthrough portrait. */
export const Sizes = meta.story({
  render: (args) => (
    <Group>
      {[18, 24, 30, 44, 56].map((size) => (
        <NameDisc key={size} {...args} size={size} />
      ))}
      <NameDisc {...args} size="2.6rem" src={AVATAR} />
    </Group>
  ),
});
