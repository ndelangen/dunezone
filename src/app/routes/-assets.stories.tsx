import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

import { pageStoryMeta } from './-storybookConfig';

const meta = preview.meta({
  title: 'Assets',
  ...pageStoryMeta,
});

export const Catalogue = meta.story({ args: { path: '/assets' } });
export const TreacheryCards = meta.story({
  args: { path: '/assets/card-treachery' },
});

export const TreacheryCard = meta.story({
  args: { path: '/assets/card-treachery/lasgun' },
});
export const Deck = meta.story({ args: { path: '/assets/deck/house-treachery' } });
export const DiscToken = meta.story({ args: { path: '/assets/token-disc/karama' } });
export const EnhanceToken = meta.story({
  args: { path: '/assets/token-enhance/kwisatz-haderach' },
});
export const Bundle = meta.story({ args: { path: '/assets/bundle/atreides-tokens' } });

export const CreateTreacheryCard = meta.story({
  args: { path: '/assets/card-treachery/create' },
});
export const CreateDeck = meta.story({ args: { path: '/assets/deck/create' } });
export const CreateDiscToken = meta.story({ args: { path: '/assets/token-disc/create' } });
export const CreateEnhanceToken = meta.story({
  args: { path: '/assets/token-enhance/create' },
});
export const CreateBundle = meta.story({ args: { path: '/assets/bundle/create' } });

export const EditTreacheryCard = meta.story({
  args: { path: '/assets/card-treachery/lasgun/edit' },
});
export const EditDeck = meta.story({ args: { path: '/assets/deck/house-treachery/edit' } });
export const EditDiscToken = meta.story({ args: { path: '/assets/token-disc/karama/edit' } });
export const EditEnhanceToken = meta.story({
  args: { path: '/assets/token-enhance/kwisatz-haderach/edit' },
});
export const EditBundle = meta.story({
  args: { path: '/assets/bundle/atreides-tokens/edit' },
});

/**
 * The editor reached by a reader who is not signed in.
 * The assertions are the point rather than the render: this state and the two below all rendered before this frame existed, so a story that only mounts them would go green either way.
 *
 * The edit route rather than the create route, because this one asks the server: its gate reads `viewerAccess.viewer.kind`, which the asset query decides from the identity, while the create pages read the profile session, which the story seam leaves unresolved rather than answering "signed out".
 */
export const EditDeckSignedOut = meta.story({
  args: { path: '/assets/deck/house-treachery/edit' },
  parameters: { identity: null },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('link', { name: 'Log in' }, { timeout: 30_000 })).resolves.toBeVisible();
    const back = await page.findByRole('link', { name: 'Back to decks' }, { timeout: 30_000 });
    await expect(back).toBeVisible();
    /* The words here did not change, only who owns them: this route's own frame used to put the way
       back inside the pane, below the sentence, and the shared frame puts it in the band. Asserting
       the position is what makes this story discriminate rather than pass against either version. */
    expect(back.closest('main')).toBeNull();
  },
});

/** A slug that names no deck. The page keeps its own name in the band and says what is missing in the body. */
export const EditDeckMissing = meta.story({
  args: { path: '/assets/deck/there-is-no-such-deck/edit' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('heading', { name: 'Edit deck' }, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(page.findByRole('heading', { name: 'Deck not found' }, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(page.findByRole('link', { name: 'Back to decks' }, { timeout: 30_000 })).resolves.toBeVisible();
  },
});

/** A type the registry knows and nothing can author yet, which is a statement about the roadmap rather than a missing page. */
export const CreateStormCardNoEditor = meta.story({
  args: { path: '/assets/card-storm/create' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('heading', { name: 'Storm cards' }, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(page.findByRole('heading', { name: 'No editor yet' }, { timeout: 30_000 })).resolves.toBeVisible();
  },
});
