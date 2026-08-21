import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

import { OpenableTile } from './OpenableTile';

const art = <div style={{ width: '100%', aspectRatio: '1 / 1.4', background: 'linear-gradient(#887849, #574b2a)' }} />;

const meta = preview.meta({
  component: OpenableTile,
  parameters: { layout: 'centered' },
  args: {
    caption: 'Shield!',
    /* Children spelled out, so the static a11y rule can see the anchor has content. */
    renderRoot: ({ children, ...rest }) => (
      <a {...rest} href="#shield">
        {children}
      </a>
    ),
    children: art,
  },
  argTypes: { renderRoot: { control: false }, children: { control: false } },
});

/** The caption is the link's accessible name, so the tile reads as what it opens. */
export const Default = meta.story({
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await expect(page.getByRole('link', { name: 'Shield!' })).toBeVisible();
  },
});

/** A counted caption, the collapsed composition view's shape: the count is part of the name. */
export const CountedCaption = meta.story({
  args: { caption: 'Shield! ×3' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await expect(page.getByRole('link', { name: 'Shield! ×3' })).toBeVisible();
  },
});
