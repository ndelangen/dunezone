import preview from '@sb/preview';
import { INITIAL_BACKGROUND_PRESETS } from '@shared/backgrounds/defaults';
import { backgroundPresetSchema } from '@shared/backgrounds/schema';
import { expect, within } from 'storybook/test';

import { db } from '@db/storybook';

import presetSnapshot from './_app/assets/presets-production.stories.fixture.json';
import { storyPage, findDetailFace } from './assets.stories.fixture';
import { expectToolbarOnOneLine } from './authoringToolbarPlay';
import { expectFieldValue } from './pagePlay';
import { pageStoryMeta } from './storybookConfig';

const meta = preview.meta({
  title: 'Assets',
  ...pageStoryMeta,
});

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

export const CreateLeaderSkillCard = meta.story({
  args: { path: '/assets/card-leaderability/create' },
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
export const EditSpiceCard = meta.story({
  args: { path: '/assets/card-spice/arsunt/edit' },
  play: ({ canvasElement }) => expectFieldValue(canvasElement, 'Name', 'Arsunt'),
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
        /* A back's authored link to its own preset stays on the back; the preset holds the plain background. */
        ...presetSnapshot.backs.map(
          ({
            key,
            label,
            cardback: {
              background: { source: _source, ...value },
            },
          }) => ({
            key: `back/${key}`,
            name: `${label} back`,
            value,
            revision: 1,
          })
        ),
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

export const EditStrongholdCard = meta.story({
  args: { path: '/assets/card-stronghold/arrakeen/edit' },
  play: ({ canvasElement }) => expectFieldValue(canvasElement, 'Name', 'Arrakeen'),
});
