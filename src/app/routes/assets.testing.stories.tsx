import { testingPreview } from '@sb/preview';
import { publishingTreacheryCard } from '@shared/assets/fixtures/publishingTreacheryCard';
import { GF9_LEADER_SKILLS } from '@shared/assets/gf9LeaderSkills';
import { completeHold } from '@ui/control/useHoldToConfirm.stories.fixture';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { db, ref, asset } from '@db/storybook';

import { storyPage, findDetailFace } from './assets.stories.fixture';
import { findSave } from './authoringToolbarPlay';
import {
  craftLinearAngle,
  expectFreshLinear,
  flipAwayToRadial,
  openLayerEditor,
  resetAndSettle,
} from './backgroundMemoryPlay';
import { expectFieldValue } from './pagePlay';
import { pageStoryMeta } from './storybookConfig';

const meta = testingPreview.meta({
  title: 'Assets',
  ...pageStoryMeta,
});

/**
 * The editor reached by a reader who is not signed in.
 * The assertions are the point rather than the render: this state and the two below all rendered before this frame existed, so a story that only mounts them would go green either way.
 *
 * Its gate reads `viewerAccess.viewer.kind`, which `useAssetAccess` combines in the browser from the public asset page and the profile session.
 * The create page gates below read the profile session through `useSessionViewer` directly, and became coverable when `toLiveQueryResult` stopped collapsing a signed-out null into the pending shape (#803).
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
    await expect(back.closest('main')).toBeNull();
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
    await expect(page.queryByRole('textbox', { name: 'Body' })).toBeNull();
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
 * Choosing the saved Treachery category leaves Save disabled.
 * Treachery offers its standard categories.
 */
export const EditTreacheryCardChoosingTheSameCategoryIsNotAChange = meta.story({
  args: { path: '/assets/card-treachery/lasgun/edit' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(findSave(canvasElement)).resolves.toHaveAccessibleDescription(/^No unsaved changes/);
    await userEvent.click(await page.findByRole('combobox', { name: 'Category' }, { timeout: 30_000 }));
    await userEvent.click(await page.findByRole('option', { name: /^Weapon$/ }));
    await expect(findSave(canvasElement)).resolves.toHaveAccessibleDescription(/^No unsaved changes/);
  },
});

/**
 * Opening the Custom background composer changes session intent without changing saved data.
 * Save must stay disabled until the author changes the background itself.
 */
export const EditCustomCardDeclaringCustomIsNotAChange = meta.story({
  args: { path: '/assets/card-custom/battle-reference/edit' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(findSave(canvasElement)).resolves.toHaveAccessibleDescription(/^No unsaved changes/);
    const picker = await page.findByRole('combobox', { name: 'Head background preset' }, { timeout: 30_000 });
    await userEvent.click(picker);
    await userEvent.click(await page.findByRole('option', { name: /^Custom$/ }));
    await expect(findSave(canvasElement)).resolves.toHaveAccessibleDescription(/^No unsaved changes/);
  },
});

/**
 * The same Reset, one directory over, for the composer's colour-mode memory (#893).
 *
 * `BackgroundComposer` kept the last value per mode in a ref, so flipping solid/linear/radial and back restored what you had.
 * The token editors reach it through `BackgroundPresetControl`, which usually unmounts the composer on Reset because the declared Custom intent dies with the draft.
 * It does not when the saved background matches no preset: `presetSelection` reads Custom from the value alone, the composer stays mounted across the Reset, and the ref stands.
 * That is why this story seeds a face background that is nobody's preset;
 * with the stock one it would prove nothing, because the composer would be gone before the flip.
 *
 * The angle is the assertion for the same reason as the faction story: both outcomes are a linear gradient and only its shape tells them apart.
 */
export const EditDiscTokenResetDiscardsTheKeptGradient = meta.story({
  args: { path: '/assets/token-disc/karama/edit' },
  parameters: {
    database: db((baseline) => {
      for (const row of baseline.assets) {
        if (row.type === 'token-disc') {
          const data = row.data as { front: { background: unknown } };
          data.front.background = {
            image: '/image/texture/021.jpg',
            colors: ['#123456', '#654321'],
            influence: 0.5,
            invert: false,
            definition: 1,
          };
        }
      }
    }),
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('tab', { name: 'Front face' }, { timeout: 30_000 }));
    await openLayerEditor(page, 'pattern');
    await craftLinearAngle(page, 'pattern', '135');
    await flipAwayToRadial(page, 'pattern');
    await resetAndSettle(page);
    await expectFreshLinear(page, 'pattern');
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
    await expect(findSave(canvasElement)).resolves.toHaveAccessibleDescription(/^No unsaved changes/);

    await userEvent.click((await backside()).getByRole('radio', { name: 'Composed here' }));
    await userEvent.click(await page.findByRole('tab', { name: 'Back rim' }, { timeout: 30_000 }));
    await expect(page.findByRole('textbox', { name: 'Top label' }, { timeout: 30_000 })).resolves.not.toHaveValue(
      'KEPT'
    );
  },
});

/**
 * The deck editor states only the latest save's failure (CodeRabbit on #1435).
 * The first save fails at the server, because a name made only of punctuation gives the deck no URL.
 * The second never reaches the server, because the card back names another deck without picking one.
 * The first save's failure must not stay on the page beside the missing pick.
 */
export const EditDeckShowsOnlyTheLatestSaveFailure = meta.story({
  args: { path: '/assets/deck/house-treachery/edit' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const name = await page.findByRole('textbox', { name: 'Name' }, { timeout: 30_000 });
    await userEvent.clear(name);
    await userEvent.type(name, '!!!');
    await userEvent.click(page.getByRole('button', { name: 'Save deck' }));
    await expect(page.findByText('Could not save', {}, { timeout: 30_000 })).resolves.toBeVisible();

    await userEvent.click(page.getByRole('tab', { name: 'Back' }));
    await userEvent.click(page.getByRole('radio', { name: "Another deck's back" }));
    await userEvent.click(page.getByRole('button', { name: 'Save deck' }));
    await expect(page.findByText('No deck picked', {}, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(page.queryByText('Could not save')).toBeNull();
  },
});

/**
 * A spice card saves through the same create flow and lands on its own editor.
 * The territory is picked first so the saved card carries a complete face, and the empty body is saved as the renderer's standard sentence.
 */
export const CreateSpiceCardSaves = meta.story({
  args: { path: '/assets/card-spice/create' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const name = await page.findByRole('textbox', { name: 'Name' }, { timeout: 30_000 });
    await userEvent.type(name, 'Storybook Basin');
    await userEvent.click(page.getByRole('tab', { name: 'Map' }));
    await userEvent.type(page.getByRole('combobox', { name: 'Highlighted territories' }), 'Basin');
    await userEvent.click(await page.findByRole('option', { name: 'Imperial Basin' }));
    await userEvent.click(page.getByRole('button', { name: 'Save card' }));
    await expect(page.findByRole('button', { name: 'Delete card' }, { timeout: 30_000 })).resolves.toBeVisible();
  },
});

/** The spice card editor opens on a stored card, its fields reading the stored values. */
export const EditSpiceCardReadsTheStoredCard = meta.story({
  args: { path: '/assets/card-spice/arsunt/edit' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('textbox', { name: 'Type' }, { timeout: 30_000 })).resolves.toHaveValue('Spice blow');
    await userEvent.click(page.getByRole('tab', { name: 'Body' }));
    await expect(page.findByRole('textbox', { name: 'Amount' })).resolves.toHaveValue('6');
  },
});

/** An administrator converts the existing card and arrives at its editable layers. */
export const ConvertTreacheryCard = meta.story({
  args: { path: '/assets/card-treachery/lasgun' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const trigger = await page.findByRole('button', { name: 'Convert to custom card' }, { timeout: 30_000 });
    await waitFor(() => expect(trigger).toBeEnabled());
    await completeHold(trigger);
    await expect(
      page.findByRole('tablist', { name: 'Custom card chapters' }, { timeout: 30_000 })
    ).resolves.toBeVisible();
    await userEvent.click(page.getByRole('tab', { name: '1. Decal' }));
    await expect(page.getByRole('switch', { name: 'Behind frame' })).toBeChecked();
    await expect(page.getByRole('tab', { name: '2. Text' })).toBeVisible();
    await userEvent.click(page.getByRole('tab', { name: 'About' }));
    await expect(page.getByRole('textbox', { name: 'About' })).toHaveValue(
      'A lasgun-shield interaction destroys both players and everything in the territory.'
    );
  },
});

/** Converting another creator's card keeps its owner and opens the public card rather than an unauthorized editor. */
export const ConvertAnotherCreatorsCard = meta.story({
  args: { path: '/assets/card-treachery/lasgun' },
  parameters: {
    database: db((baseline) => ({
      ...baseline,
      users: [...baseline.users!, { $key: 'other-card-owner', name: 'Another creator' }],
      profiles: [
        ...baseline.profiles!,
        {
          user_id: ref('other-card-owner'),
          username: 'Another creator',
          slug: 'another-creator',
          avatar_url: null,
          account_state: 'active',
          created_at: '2026-01-01T12:00:00.000Z',
          updated_at: '2026-01-01T12:00:00.000Z',
        },
      ],
      assets: baseline.assets!.map((asset) =>
        asset.type === 'card-treachery' && asset.slug === 'lasgun'
          ? { ...asset, owner_id: ref('other-card-owner'), group_id: null }
          : asset
      ),
    })),
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const trigger = await page.findByRole('button', { name: 'Convert to custom card' }, { timeout: 30_000 });
    await waitFor(() => expect(trigger).toBeEnabled());
    await completeHold(trigger);
    await expect(page.findByRole('link', { name: /^Custom cards$/ }, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(page.getByRole('link', { name: 'House Treachery ×3' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Another creator' })).toBeVisible();
    await expect(page.queryByRole('link', { name: 'Edit Lasgun' })).toBeNull();
    await expect(page.queryByRole('button', { name: 'Convert to custom card' })).toBeNull();
  },
});

/** A new leader skill keeps both abilities through the create-to-edit handoff. */
export const CreateLeaderSkillCardSaves = meta.story({
  args: { path: '/assets/card-leaderability/create' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const name = await page.findByRole('textbox', { name: 'Name' }, { timeout: 30_000 });
    await userEvent.type(name, 'Storybook Leader Skill');
    await userEvent.click(page.getByRole('tab', { name: 'Abilities' }));
    await userEvent.type(page.getByRole('textbox', { name: 'General ability' }), 'Collect one spice.');
    await userEvent.type(page.getByRole('textbox', { name: 'Battle ability' }), 'Add +2 to this leader.');
    await userEvent.click(await findSave(canvasElement));
    await expect(page.findByRole('button', { name: 'Delete card' }, { timeout: 30_000 })).resolves.toBeVisible();
    await userEvent.click(page.getByRole('tab', { name: 'Abilities' }));
    await expect(page.getByRole('textbox', { name: 'General ability' })).toHaveValue('Collect one spice.');
    await expect(page.getByRole('textbox', { name: 'Battle ability' })).toHaveValue('Add +2 to this leader.');
  },
});

/** Text that exceeds the fixed frame cannot be saved, and shortening it restores Save. */
export const CreateLeaderSkillCardOverflow = meta.story({
  args: { path: '/assets/card-leaderability/create' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.type(await page.findByRole('textbox', { name: 'Name' }, { timeout: 30_000 }), 'Oversized Skill');
    await userEvent.click(page.getByRole('tab', { name: 'Abilities' }));
    const general = page.getByRole('textbox', { name: 'General ability' });
    const battle = page.getByRole('textbox', { name: 'Battle ability' });
    await userEvent.type(general, 'Wide words that fill the available card space. '.repeat(12));
    await userEvent.type(battle, 'Wide words that fill the available card space. '.repeat(12));
    const save = await findSave(canvasElement);
    await expect(save).toHaveAttribute('aria-disabled', 'true');
    await expect(save).toHaveAccessibleDescription(expect.stringContaining('extend beyond the card'));
    await userEvent.clear(general);
    await userEvent.type(general, 'Collect one spice.');
    await userEvent.clear(battle);
    await userEvent.type(battle, 'Add +2 to this leader.');
    await waitFor(() => expect(save).not.toHaveAttribute('aria-disabled', 'true'));
  },
});

/** An existing stock skill opens in the same editor and resets to its saved abilities. */
export const EditLeaderSkillCard = meta.story({
  args: { path: '/assets/card-leaderability/planetologist/edit' },
  parameters: {
    database: db((baseline) => {
      baseline.assets.push({
        $key: 'asset:leader-skill-planetologist',
        owner_id: ref('storybook-viewer'),
        type: 'card-leaderability',
        slug: 'planetologist',
        data: GF9_LEADER_SKILLS[5]!,
        is_deleted: false,
        group_id: null,
        created_at: '2026-01-01T12:00:00.000Z',
        updated_at: '2026-01-01T12:00:00.000Z',
      });
    }),
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('tab', { name: 'Abilities' }, { timeout: 30_000 }));
    const battle = page.getByRole('textbox', { name: 'Battle ability' });
    await userEvent.clear(battle);
    await userEvent.type(battle, 'An unsaved custom battle ability.');
    await userEvent.click(page.getByRole('button', { name: 'Reset unsaved edits' }));
    await expect(battle).toHaveValue(GF9_LEADER_SKILLS[5]!.battleText);
  },
});

/** A new stronghold saves its constrained face and reopens for editing. */
export const CreateStrongholdCardSaves = meta.story({
  args: { path: '/assets/card-stronghold/create' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const name = await page.findByRole('textbox', { name: 'Name' }, { timeout: 30_000 });
    await userEvent.type(name, 'Storybook Stronghold');
    await userEvent.click(page.getByRole('tab', { name: 'Body' }));
    await userEvent.type(page.getByRole('textbox', { name: 'Body' }), 'Win tied battles here.');
    await userEvent.click(page.getByRole('button', { name: 'Save card' }));
    await expect(page.findByRole('button', { name: 'Delete card' }, { timeout: 30_000 })).resolves.toBeVisible();
    await userEvent.click(page.getByRole('tab', { name: 'Body' }));
    await expect(page.findByRole('textbox', { name: 'Body' })).resolves.toHaveValue('Win tied battles here.');
  },
});

export const CreateNexusCardLinksFaction = meta.story({
  args: { path: '/assets/card-nexus/create' },
  play: async () => {
    const page = within(document.body);
    await userEvent.type(await page.findByRole('textbox', { name: 'Name' }), 'My Nexus');
    await userEvent.click(page.getByRole('tab', { name: 'Faction' }));
    await userEvent.click(page.getByRole('button', { name: 'Choose faction' }));
    await userEvent.click(await page.findByRole('option', { name: /House Atreides/ }, { timeout: 30_000 }));
    await userEvent.click(page.getByRole('button', { name: 'Link faction' }));
    await expect(page.getByRole('textbox', { name: 'Faction' })).toHaveValue('House Atreides');
    await expect(page.queryByRole('combobox', { name: 'Faction symbol' })).toBeNull();
    await userEvent.click(page.getByRole('tab', { name: 'Effects' }));
    for (const label of ['Betrayal', 'Cunning', 'Secret Ally']) {
      await userEvent.type(page.getByRole('textbox', { name: label }), `Custom ${label} effect.`);
    }
    await userEvent.click(page.getByRole('button', { name: 'Save card' }));
    await expect(page.findByRole('button', { name: 'Delete card' }, { timeout: 30_000 })).resolves.toBeVisible();
    await userEvent.click(page.getByRole('tab', { name: 'Faction' }));
    await expect(page.getByRole('textbox', { name: 'Faction' })).toHaveValue('House Atreides');
    await expect(page.getByRole('button', { name: 'Change faction' })).toBeVisible();
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
export const EditEnhanceToken = meta.story({
  args: { path: '/assets/token-enhance/kwisatz-haderach/edit' },
  play: ({ canvasElement }) => expectFieldValue(canvasElement, 'Name', 'Kwisatz Haderach'),
});

export const CreateSpiceCard = meta.story({
  args: { path: '/assets/card-spice/create' },
  play: ({ canvasElement }) => expectFieldValue(canvasElement, 'Name', ''),
});

export const CreateCustomCard = meta.story({
  args: { path: '/assets/card-custom/create' },
  play: ({ canvasElement }) => expectFieldValue(canvasElement, 'Name', ''),
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
