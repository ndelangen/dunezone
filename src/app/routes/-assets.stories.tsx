import preview from '@sb/preview';
import { expect, userEvent, within } from 'storybook/test';

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
 * This one asks the server: its gate reads `viewerAccess.viewer.kind`, which the asset query decides from the identity.
 * The create page gates below read the profile session through `useSessionViewer` instead, and became coverable when `toLiveQueryResult` stopped collapsing a signed-out null into the pending shape (#803).
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

/**
 * The five create pages reached by a reader who is not signed in, one story per gate site because each page owns its own gate.
 * Finding the gate is only half the assertion: each story also pins that the editor did not render, since these pages historically showed their editor to a signed-out reader whenever the session read as pending (#803).
 */
export const CreateTreacheryCardSignedOut = meta.story({
  args: { path: '/assets/card-treachery/create' },
  parameters: { identity: null },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('link', { name: 'Log in' }, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(
      page.findByRole('link', { name: 'Back to treachery cards' }, { timeout: 30_000 })
    ).resolves.toBeVisible();
    expect(page.queryByRole('button', { name: 'Save card' })).toBeNull();
  },
});

export const CreateDeckSignedOut = meta.story({
  args: { path: '/assets/deck/create' },
  parameters: { identity: null },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('link', { name: 'Log in' }, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(page.findByRole('link', { name: 'Back to decks' }, { timeout: 30_000 })).resolves.toBeVisible();
    expect(page.queryByRole('button', { name: 'Save deck' })).toBeNull();
  },
});

export const CreateDiscTokenSignedOut = meta.story({
  args: { path: '/assets/token-disc/create' },
  parameters: { identity: null },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('link', { name: 'Log in' }, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(page.findByRole('link', { name: 'Back to disc tokens' }, { timeout: 30_000 })).resolves.toBeVisible();
    expect(page.queryByRole('button', { name: 'Save token' })).toBeNull();
  },
});

export const CreateEnhanceTokenSignedOut = meta.story({
  args: { path: '/assets/token-enhance/create' },
  parameters: { identity: null },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('link', { name: 'Log in' }, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(
      page.findByRole('link', { name: 'Back to enhance tokens' }, { timeout: 30_000 })
    ).resolves.toBeVisible();
    expect(page.queryByRole('button', { name: 'Save token' })).toBeNull();
  },
});

export const CreateBundleSignedOut = meta.story({
  args: { path: '/assets/bundle/create' },
  parameters: { identity: null },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('link', { name: 'Log in' }, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(page.findByRole('link', { name: 'Back to bundles' }, { timeout: 30_000 })).resolves.toBeVisible();
    expect(page.queryByRole('button', { name: 'Save bundle' })).toBeNull();
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

/**
 * Creating a card saves it and hands the author to its editor at the slug the server minted.
 *
 * The navigation is the proof rather than the badge: a resolved promise alone would let the toolbar read "Saved", but the route cannot reach the edit page without a real id and slug coming back.
 * "Delete card" is what tells the two pages apart, since only the editor carries a destructive action.
 */
export const CreateTreacheryCardSaves = meta.story({
  args: { path: '/assets/card-treachery/create' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const name = await page.findByRole('textbox', { name: 'Name' }, { timeout: 30_000 });
    await userEvent.type(name, 'Storybook Lasgun');
    await userEvent.click(page.getByRole('button', { name: 'Save card' }));
    await expect(page.findByRole('button', { name: 'Delete card' }, { timeout: 30_000 })).resolves.toBeVisible();
  },
});

/**
 * A validation chip moves the editor to the chapter that warning belongs to.
 *
 * The routing is the route's own: `ValidationHeader` reports which warning was chosen and this page decides `setChapter(warning.chapter)`, so the chapter key travels from the draft's warnings through the header and back into route state.
 * Asserting the Body field is absent first is what stops this passing whatever the chip does.
 */
export const CreateTreacheryCardChapterJump = meta.story({
  args: { path: '/assets/card-treachery/create' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await page.findByRole('textbox', { name: 'Name' }, { timeout: 30_000 });
    expect(page.queryByRole('textbox', { name: 'Body' })).toBeNull();
    const chip = await page.findByRole('button', { name: /Body/ }, { timeout: 30_000 });
    await userEvent.click(chip);
    await expect(page.findByRole('textbox', { name: 'Body' }, { timeout: 30_000 })).resolves.toBeVisible();
  },
});

/**
 * A deck's composition counts are server state, written on commit rather than held until Save.
 *
 * The rail's total is the proof and the count field is not: `MemberCountInput` keeps what you typed in its own state and reclaims it on commit, so the field would read the new number whether or not anything was written.
 * The total is reduced from the members the page query returns, so it can only move once the mutation has landed and the query has re-run.
 */
export const EditDeckMemberCountWrites = meta.story({
  args: { path: '/assets/deck/house-treachery/edit' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByText('3 cards across 1 title', {}, { timeout: 30_000 })).resolves.toBeVisible();
    await userEvent.click(await page.findByRole('tab', { name: 'Cards' }, { timeout: 30_000 }));
    const copies = await page.findByRole('textbox', { name: /^Copies of / }, { timeout: 30_000 });
    await userEvent.clear(copies);
    await userEvent.type(copies, '2');
    await userEvent.tab();
    await expect(page.findByText('2 cards across 1 title', {}, { timeout: 30_000 })).resolves.toBeVisible();
  },
});

/**
 * Declaring Custom is not an unsaved change, which is D6 on «Work the editors wave».
 *
 * The declared intent lives in the session's memory beside the draft, and memory is never posted, so a Save armed by it would write an identical payload and then report success over an unchanged row.
 * The assertion is the toolbar rather than the reducer, because the reducers are local to their pages by D7 and this is the behaviour the ruling is actually about.
 * It also states the accepted cost from the other side: this intent changes what a later head pick does, and the page still calls itself unchanged.
 */
export const EditTreacheryCardDeclaringCustomIsNotAChange = meta.story({
  args: { path: '/assets/card-treachery/lasgun/edit' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByText('No unsaved changes', {}, { timeout: 30_000 })).resolves.toBeVisible();
    const row = within(await page.findByRole('radiogroup', { name: 'Head background' }, { timeout: 30_000 }));
    await userEvent.click(row.getByRole('radio', { name: 'Custom' }));
    /* The composer opening is the declaration, so this is the state the ruling had to answer for. */
    await expect(page.findByText('No unsaved changes', {}, { timeout: 30_000 })).resolves.toBeVisible();
  },
});

/**
 * A Reset discards the face the editor was keeping for you, which is D3's first unlocked finding on «Work the editors wave».
 *
 * The composed face and the referenced target used to be refs inside the token editor, so a Reset the widget could not see left them standing.
 * Flipping back to a mode afterwards restored work the author had already discarded, and for the reference half a save would then write a token the page never showed.
 * They live in the page's reducer memory now, and `replace` rebuilds the whole state, so the keep dies with the draft.
 *
 * The assertion is the face rather than the toolbar, because both outcomes leave the page dirty;
 * only the content tells them apart.
 * With the keep discarded, returning to Composed starts from the editor's own opening face.
 * With the keep surviving, it would restore the word typed before the Reset.
 */
export const EditDiscTokenResetDiscardsTheKeptFace = meta.story({
  args: { path: '/assets/token-disc/karama/edit' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const backside = async () => within(await page.findByRole('radiogroup', { name: 'Backside' }, { timeout: 30_000 }));

    /* The stored back is "same as front", so composing one is what gives the editor a face to keep. */
    await userEvent.click((await backside()).getByRole('radio', { name: 'Composed here' }));
    await userEvent.click(await page.findByRole('tab', { name: 'Back rim' }, { timeout: 30_000 }));
    const top = await page.findByRole('textbox', { name: 'Top label' }, { timeout: 30_000 });
    await userEvent.clear(top);
    await userEvent.type(top, 'KEPT');

    /* Flipping away is what captures that face, and the reference tile is the way out that still leaves the draft dirty, so Reset is armed. */
    await userEvent.click(await page.findByRole('tab', { name: 'Identity' }, { timeout: 30_000 }));
    await userEvent.click((await backside()).getByRole('radio', { name: "Another token's back" }));

    await userEvent.click(page.getByRole('button', { name: 'Reset unsaved edits' }));
    await expect(page.findByText('No unsaved changes', {}, { timeout: 30_000 })).resolves.toBeVisible();

    await userEvent.click((await backside()).getByRole('radio', { name: 'Composed here' }));
    await userEvent.click(await page.findByRole('tab', { name: 'Back rim' }, { timeout: 30_000 }));
    await expect(page.findByRole('textbox', { name: 'Top label' }, { timeout: 30_000 })).resolves.not.toHaveValue(
      'KEPT'
    );
  },
});
