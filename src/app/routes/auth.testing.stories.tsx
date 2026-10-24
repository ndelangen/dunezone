import { testingPreview } from '@sb/preview';
import { createMemoryHistory } from '@tanstack/react-router';
import { expect, waitFor, within } from 'storybook/test';

import { StorybookPage } from './storybook';
import { pageStoryMeta } from './storybookConfig';

const meta = testingPreview.meta({
  title: 'Auth',
  ...pageStoryMeta,
});

let history = createMemoryHistory({ initialEntries: ['/play/create'] });

/* Arriving at sign-in grows the band to the window, and leaving shrinks it back over the arriving page. */
export const BandGrowsAndShrinks = meta.story({
  args: { path: '/play/create' },
  parameters: { identity: null },
  globals: { motion: 'on' },
  beforeEach: () => {
    history = createMemoryHistory({ initialEntries: ['/play/create'] });
  },
  render: (args) => <StorybookPage {...args} history={history} />,
  play: async ({ canvasElement }) => {
    const document = canvasElement.ownerDocument;
    const page = within(document.body);
    const frame = document.querySelector('[data-app-frame]')!;
    await page.findByRole('heading', { name: 'Create a game', level: 1 }, { timeout: 30_000 });
    history.push('/auth/login');
    await page.findByRole('button', { name: 'Continue with Google' }, { timeout: 30_000 });
    /* The grow holds its end state, so the shrink starts from the window-sized band. */
    await Promise.all(frame.getAnimations({ subtree: true }).map((animation) => animation.finished));
    history.push('/faq');
    await waitFor(() => expect(frame).toHaveAttribute('data-band-unwinding'));
    await waitFor(() => expect(frame).not.toHaveAttribute('data-band-unwinding'));
  },
});
