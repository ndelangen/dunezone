import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

import { TitledLine } from './TitledLine';

const swatch = <div style={{ width: 32, height: 42, borderRadius: 4, background: 'var(--color-link)' }} />;

const meta = preview.meta({
  component: TitledLine,
  parameters: { layout: 'padded' },
  args: { title: 'Kwisatz Haderach', detail: 'Treachery card · Norbert' },
  decorators: [(Story) => <div style={{ width: 280 }}>{Story()}</div>],
});

/** A name over what kind of thing it is. */
export const Default = meta.story({});

/** With a small picture before the words, as a picker option draws an asset. */
export const WithMedia = meta.story({
  args: { media: swatch },
});

/** A long name and detail keep to one line each and end in an ellipsis. */
export const Truncates = meta.story({
  args: {
    media: swatch,
    title: 'The very long name of a homebrew treachery card that will not fit',
    detail: 'Treachery card · A member with a long display name and a group',
  },
  play: async ({ canvasElement }) => {
    const title = within(canvasElement).getByText(/The very long name/);
    await expect(title.scrollWidth).toBeGreaterThan(title.clientWidth);
  },
});
