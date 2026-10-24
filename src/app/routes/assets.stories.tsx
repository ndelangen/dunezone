import preview from '@sb/preview';
import { publishingTreacheryCard } from '@shared/assets/fixtures/publishingTreacheryCard';
import { INITIAL_BACKGROUND_PRESETS } from '@shared/backgrounds/defaults';
import { backgroundPresetSchema } from '@shared/backgrounds/schema';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { asset, db } from '@db/storybook';

import presetSnapshot from './_app/assets/presets-production.stories.fixture.json';
import { expectToolbarOnOneLine } from './authoringToolbarPlay';
import { expectFieldValue } from './pagePlay';
import { pageStoryMeta } from './storybookConfig';

const meta = preview.meta({
  title: 'Assets',
  ...pageStoryMeta,
});

const storyPage = (canvasElement: HTMLElement) => within(canvasElement.ownerDocument.body);

/** The detail page's heading names the asset, and its head shows the face beside it. */
async function findDetailFace(canvasElement: HTMLElement, name: string) {
  const page = storyPage(canvasElement);
  await expect(page.findByRole('heading', { name, level: 1 }, { timeout: 30_000 })).resolves.toBeVisible();
  return page.getByRole('img', { name: `${name} face` });
}

export const Catalogue = meta.story({
  args: { path: '/assets' },
  play: async ({ canvasElement }) => {
    const page = storyPage(canvasElement);
    await page.findByRole('heading', { name: 'Assets', level: 1 }, { timeout: 30_000 });
    /* Each row's label also names a pile inside it, so the first match is the row's own. */
    for (const row of ['Cards & decks', 'Tokens', 'Boards']) {
      await expect((await page.findAllByText(row))[0]).toBeVisible();
    }
  },
});
export const TreacheryCards = meta.story({
  args: { path: '/assets/card-treachery' },
  play: async ({ canvasElement }) => {
    await expect(
      storyPage(canvasElement).findByRole('link', { name: /Lasgun/ }, { timeout: 30_000 })
    ).resolves.toBeVisible();
  },
});

/**
 * A search shows its best matches and loads more in place: no pages, no count, and the sort is best match alone.
 * An old link's page and order are dropped, so it opens the search's first matches.
 * "Load more" lengthens the grid until every match is shown, and hands focus to the first new tile.
 */
export const TreacheryCardsSearched = meta.story({
  args: { path: '/assets/card-treachery?q=lasgun&page=2&sort=name' },
  parameters: {
    database: db((baseline) => {
      for (let index = 1; index <= 25; index += 1) {
        const name = `Lasgun ${String(index).padStart(2, '0')}`;
        baseline.assets.push(asset({ type: 'card-treachery', data: { ...publishingTreacheryCard, name } }));
      }
    }),
  },
  play: async ({ canvasElement }) => {
    const page = storyPage(canvasElement);
    const main = within(await page.findByRole('main', {}, { timeout: 30_000 }));
    const loadMore = await main.findByRole('button', { name: 'Load more' }, { timeout: 30_000 });
    await expect(main.getAllByRole('link', { name: /Lasgun/ })).toHaveLength(24);
    await expect(page.queryByLabelText('Treachery cards pages')).toBeNull();
    await expect(page.queryByText(/of \d+ treachery cards/)).toBeNull();
    await expect(page.getByRole('textbox', { name: 'Search treachery cards' })).toHaveValue('lasgun');
    const sort = page.getByRole('combobox', { name: 'Sort' });
    await expect(sort).toHaveValue('Best match');
    await expect(sort).toBeDisabled();

    await userEvent.click(loadMore);
    /* The baseline's own Lasgun matches too, so the whole grid is one more than the seeded cards. */
    await waitFor(() => expect(main.getAllByRole('link', { name: /Lasgun/ })).toHaveLength(26), { timeout: 30_000 });
    await expect(main.getAllByRole('link', { name: /Lasgun/ })[24]).toHaveFocus();
    await expect(main.getByRole('status')).toHaveTextContent('More treachery cards loaded');
    await expect(main.queryByRole('button', { name: 'Load more' })).toBeNull();
  },
});

export const TreacheryCard = meta.story({
  args: { path: '/assets/card-treachery/lasgun' },
  play: async ({ canvasElement }) => {
    await expect(findDetailFace(canvasElement, 'Lasgun')).resolves.toBeVisible();
    await expect(storyPage(canvasElement).getByRole('link', { name: 'House Treachery ×3' })).toBeVisible();
  },
});
export const Deck = meta.story({
  args: { path: '/assets/deck/house-treachery' },
  play: async ({ canvasElement }) => {
    await expect(findDetailFace(canvasElement, 'House Treachery')).resolves.toBeVisible();
    const [member] = await storyPage(canvasElement).findAllByRole('link', { name: /Lasgun/ });
    await expect(member).toBeVisible();
  },
});
export const DiscToken = meta.story({
  args: { path: '/assets/token-disc/karama' },
  play: async ({ canvasElement }) => {
    const { width, height } = (await findDetailFace(canvasElement, 'Karama')).getBoundingClientRect();
    await expect(width / height).toBeCloseTo(1, 1);
  },
});
export const EnhanceToken = meta.story({
  args: { path: '/assets/token-enhance/kwisatz-haderach' },
  play: async ({ canvasElement }) => {
    const { width, height } = (await findDetailFace(canvasElement, 'Kwisatz Haderach')).getBoundingClientRect();
    await expect(width).toBeGreaterThan(height);
  },
});
export const Bundle = meta.story({
  args: { path: '/assets/bundle/atreides-tokens' },
  play: async ({ canvasElement }) => {
    const page = storyPage(canvasElement);
    await expect(findDetailFace(canvasElement, 'Atreides Tokens')).resolves.toBeVisible();
    await expect(page.findByRole('link', { name: /Karama/ })).resolves.toBeVisible();
    await expect(page.findByRole('link', { name: /Kwisatz Haderach/ })).resolves.toBeVisible();
  },
});

export const CreateLeaderSkillCard = meta.story({
  args: { path: '/assets/card-leaderability/create' },
  play: ({ canvasElement }) => expectFieldValue(canvasElement, 'Name', ''),
});

export const CreateTreacheryCard = meta.story({
  args: { path: '/assets/card-treachery/create' },
  play: ({ canvasElement }) => expectFieldValue(canvasElement, 'Name', ''),
});
export const CreateDeck = meta.story({
  args: { path: '/assets/deck/create' },
  play: ({ canvasElement }) => expectFieldValue(canvasElement, 'Name', ''),
});
export const CreateEnhanceToken = meta.story({
  args: { path: '/assets/token-enhance/create' },
  play: ({ canvasElement }) => expectFieldValue(canvasElement, 'Name', ''),
});
export const CreateBundle = meta.story({
  args: { path: '/assets/bundle/create' },
  play: ({ canvasElement }) => expectFieldValue(canvasElement, 'Name', ''),
});

export const EditTreacheryCard = meta.story({
  args: { path: '/assets/card-treachery/lasgun/edit' },
  play: ({ canvasElement }) => expectFieldValue(canvasElement, 'Name', 'Lasgun'),
});
export const EditDeck = meta.story({
  args: { path: '/assets/deck/house-treachery/edit' },
  play: ({ canvasElement }) => expectFieldValue(canvasElement, 'Name', 'House Treachery'),
});
export const EditDiscToken = meta.story({
  args: { path: '/assets/token-disc/karama/edit' },
  play: ({ canvasElement }) => expectFieldValue(canvasElement, 'Name', 'Karama'),
});
export const EditEnhanceToken = meta.story({
  args: { path: '/assets/token-enhance/kwisatz-haderach/edit' },
  play: ({ canvasElement }) => expectFieldValue(canvasElement, 'Name', 'Kwisatz Haderach'),
});
export const EditBundle = meta.story({
  args: { path: '/assets/bundle/atreides-tokens/edit' },
  play: ({ canvasElement }) => expectFieldValue(canvasElement, 'Name', 'Atreides Tokens'),
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
    await expect(page.queryByRole('button', { name: 'Save card' })).toBeNull();
  },
});

export const CreateDeckSignedOut = meta.story({
  args: { path: '/assets/deck/create' },
  parameters: { identity: null },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('link', { name: 'Log in' }, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(page.findByRole('link', { name: 'Back to decks' }, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(page.queryByRole('button', { name: 'Save deck' })).toBeNull();
  },
});

export const CreateDiscTokenSignedOut = meta.story({
  args: { path: '/assets/token-disc/create' },
  parameters: { identity: null },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('link', { name: 'Log in' }, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(page.findByRole('link', { name: 'Back to disc tokens' }, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(page.queryByRole('button', { name: 'Save token' })).toBeNull();
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
    await expect(page.queryByRole('button', { name: 'Save token' })).toBeNull();
  },
});

export const CreateBundleSignedOut = meta.story({
  args: { path: '/assets/bundle/create' },
  parameters: { identity: null },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('link', { name: 'Log in' }, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(page.findByRole('link', { name: 'Back to bundles' }, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(page.queryByRole('button', { name: 'Save bundle' })).toBeNull();
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

/** Storm authoring opens with the standard one-sector face. */
export const CreateStormCard = meta.story({
  args: { path: '/assets/card-storm/create' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('combobox', { name: 'Storm movement' })).resolves.toHaveValue('1 sector');
    await expect(page.findByText('Move the storm 1 sector counter-clockwise.')).resolves.toBeVisible();
  },
});

const DECK_EDIT_STATUSES = ['No unsaved changes'];

/**
 * The deck editor's toolbar on one line at a phone, tablet, laptop and desktop width (#1423).
 * The deck carries the most actions of any asset editor, since it adds card creation to the group and delete actions every edit page has.
 */
export const EditDeckToolbarAt360 = meta.story({
  args: { path: '/assets/deck/house-treachery/edit' },
  globals: { viewport: { value: 'appMobileNarrow' } },
  play: async ({ canvasElement }) =>
    await expectToolbarOnOneLine(canvasElement, { statusDescribes: DECK_EDIT_STATUSES }),
});
export const EditDeckToolbarAt768 = meta.story({
  args: { path: '/assets/deck/house-treachery/edit' },
  globals: { viewport: { value: 'appTablet' } },
  play: async ({ canvasElement }) =>
    await expectToolbarOnOneLine(canvasElement, { statusDescribes: DECK_EDIT_STATUSES }),
});
export const EditDeckToolbarAt1100 = meta.story({
  args: { path: '/assets/deck/house-treachery/edit' },
  globals: { viewport: { value: 'appLaptop' } },
  play: async ({ canvasElement }) =>
    await expectToolbarOnOneLine(canvasElement, { statusDescribes: DECK_EDIT_STATUSES }),
});

export const CreateSpiceCard = meta.story({
  args: { path: '/assets/card-spice/create' },
  play: ({ canvasElement }) => expectFieldValue(canvasElement, 'Name', ''),
});
export const EditSpiceCard = meta.story({
  args: { path: '/assets/card-spice/arsunt/edit' },
  play: ({ canvasElement }) => expectFieldValue(canvasElement, 'Name', 'Arsunt'),
});

export const CreateCustomCard = meta.story({
  args: { path: '/assets/card-custom/create' },
  play: ({ canvasElement }) => expectFieldValue(canvasElement, 'Name', ''),
});

export const EditCustomCard = meta.story({
  args: { path: '/assets/card-custom/battle-reference/edit' },
  parameters: {
    database: db((baseline) => {
      const backgrounds = [
        ...presetSnapshot.fronts.flatMap(({ key, label, style }) =>
          Object.entries(style).flatMap(([region, value]) =>
            value
              ? [
                  {
                    key: `front/${key}/${region === 'head' ? 'header' : 'icon'}`,
                    name: `${label} ${region === 'head' ? 'header' : 'icon'}`,
                    value,
                    revision: 1,
                  },
                ]
              : []
          )
        ),
        ...presetSnapshot.backs.map(({ key, label, cardback }) => ({
          key: `back/${key}`,
          name: `${label} back`,
          value: cardback.background,
          revision: 1,
        })),
        ...INITIAL_BACKGROUND_PRESETS,
      ];
      baseline.background_presets = backgrounds.map((preset) => ({
        ...backgroundPresetSchema.parse(preset),
        updated_at: 0,
      }));
    }),
  },
  play: ({ canvasElement }) => expectFieldValue(canvasElement, 'Name', 'Battle reference'),
});
export const TreacheryConversionUnavailable = meta.story({
  args: { path: '/assets/card-treachery/lasgun' },
  parameters: {
    database: db((baseline) => ({ ...baseline, users: baseline.users!.map((user) => ({ ...user, isAdmin: false })) })),
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await page.findByRole('heading', { name: 'Lasgun' }, { timeout: 30_000 });
    await expect(page.queryByRole('button', { name: 'Convert to custom card' })).toBeNull();
  },
});

export const EditStrongholdCard = meta.story({
  args: { path: '/assets/card-stronghold/arrakeen/edit' },
  play: ({ canvasElement }) => expectFieldValue(canvasElement, 'Name', 'Arrakeen'),
});
