import preview from '@sb/preview';
import { waitForFrame } from '@sb/storyWaits';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { db, faction, refText, SEED_REF_TOKEN } from '@db/storybook';

import { expectToolbarOnOneLine } from './authoringToolbarPlay';
import {
  craftLinearAngle,
  currentLayerMode,
  expectFreshLinear,
  flipAwayToRadial,
  layerModeControl,
  openLayerEditor,
  resetAndSettle,
} from './backgroundMemoryPlay';
import { spaceOrks, spaceOrksOwner, spaceOrksPublication } from './factionPlanets.stories.fixture';
import { pageStoryMeta } from './storybookConfig';

const meta = preview.meta({
  title: 'Factions',
  ...pageStoryMeta,
});

export const Catalogue = meta.story({ args: { path: '/factions' } });

/**
 * On a phone the faction list shows two columns and each card its compact caption.
 * The list reads its own width and the card its own, so neither needs the page.
 * This story shows them in the catalogue's phone layout.
 */
export const CatalogueMobile = meta.story({
  args: { path: '/factions' },
  globals: { viewport: { value: 'appMobile' } },
});

export const Detail = meta.story({
  args: { path: '/factions/house-atreides' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('heading', { name: 'House Atreides' })).resolves.toBeVisible();
    expect(page.queryByRole('region', { name: 'Planets' })).not.toBeInTheDocument();
  },
});

const withTroopDetails = db((baseline) => {
  const data = baseline.factions[0]!.data;
  const art = data.troops[0]!;
  data.troops = [
    {
      ...art,
      name: 'Soldiers',
      count: 15,
      description: 'The main fighting force.',
      capable: true,
      combat: { strength: 0.5, fundedStrength: 1 },
      back: {
        image: art.image,
        name: 'Advisors',
        description: 'The reverse side supports the faction without joining battles.',
        striped: true,
        capable: false,
      },
    },
    {
      ...art,
      troopId: 'a939da92-5f9f-4c50-a102-3bc437ffd1e6',
      name: 'Veterans',
      count: 5,
      description: 'A smaller force with a stronger dial.',
      capable: true,
      back: undefined,
      combat: { strength: 1, fundedStrength: 2, fundingCost: 2 },
    },
    {
      ...art,
      troopId: '5a34c071-2399-43c4-9e51-8166a876694f',
      name: 'Recruits',
      count: 8,
      description: 'Battle values have not been entered yet.',
      capable: true,
      combat: undefined,
      back: undefined,
    },
  ];
});

export const DetailWithTroopStrengths = meta.story({
  args: { path: '/factions/house-atreides' },
  parameters: { database: withTroopDetails, identity: null },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const troops = within(await page.findByRole('region', { name: 'Troops' }));
    const soldiers = within(troops.getByRole('article', { name: 'Soldiers' }));
    expect(soldiers.getByRole('img', { name: 'Strength per troop: 0.5 undialed | 1 dialed' })).toBeVisible();
    expect(soldiers.getByRole('img', { name: 'Funding cost: 1 spice per dialed troop' })).toBeVisible();
    expect(soldiers.getByRole('img', { name: 'Cannot participate in battle' })).toBeVisible();
    expect(soldiers.getByRole('img', { name: '15 troop tokens' })).toBeVisible();
    const reverse = soldiers.getByRole('img', { name: 'Advisors, reverse side' });
    expect(reverse).toHaveAccessibleDescription('The reverse side supports the faction without joining battles.');
    expect(
      within(troops.getByRole('article', { name: 'Recruits' })).getByRole('img', {
        name: 'Battle strengths have not been set. This side is unavailable in battle plans.',
      })
    ).toBeVisible();
    reverse.focus();
    await userEvent.tab({ shift: true });
    await userEvent.tab();
    expect(reverse).toHaveFocus();
    await expect(page.findByRole('tooltip')).resolves.toHaveTextContent(
      'The reverse side supports the faction without joining battles.'
    );
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(page.queryByRole('tooltip')).not.toBeInTheDocument());
  },
});

export const DetailWithTroopStrengthsMobile = meta.story({
  args: { path: '/factions/house-atreides' },
  parameters: { database: withTroopDetails, identity: null },
  globals: { viewport: { value: 'appMobileNarrow' } },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const troops = await page.findByRole('region', { name: 'Troops' });
    const sectionBounds = troops.getBoundingClientRect();
    for (const card of within(troops).getAllByRole('article')) {
      const bounds = card.getBoundingClientRect();
      expect(bounds.left).toBeGreaterThanOrEqual(sectionBounds.left);
      expect(bounds.right).toBeLessThanOrEqual(sectionBounds.right);
      expect(card.scrollWidth).toBeLessThanOrEqual(card.clientWidth);
    }
  },
});

export const DetailWithIndependentTroopFaces = meta.story({
  args: { path: '/factions/house-atreides' },
  parameters: {
    identity: null,
    database: db((baseline) => {
      const data = baseline.factions[0]!.data;
      const art = data.troops[0]!;
      data.troops = [
        {
          ...art,
          name: 'A troop with a long authored name',
          count: 1,
          combat: { strength: 0, fundedStrength: 1.5, fundingCost: 0 },
          back: {
            image: art.image,
            description: 'The reverse has its own battle values.',
            name: 'An independently authored reverse',
            combat: { strength: 0.5, fundedStrength: 1, fundingCost: 2 },
          },
        },
      ];
    }),
  },
  globals: { viewport: { value: 'appMobileNarrow' } },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const troops = within(await page.findByRole('region', { name: 'Troops' }));
    expect(troops.getByRole('img', { name: 'Strength per troop: 0 undialed | 1.5 dialed' })).toBeVisible();
    expect(troops.getByRole('img', { name: 'Funding cost: 0 spice per dialed troop' })).toBeVisible();
    expect(troops.getByRole('img', { name: 'Strength per troop: 0.5 undialed | 1 dialed' })).toBeVisible();
    const card = troops.getByRole('article');
    expect(card.scrollWidth).toBeLessThanOrEqual(card.clientWidth);
    const flip = troops
      .getByRole('img', { name: 'Flip side: An independently authored reverse' })
      .getBoundingClientRect();
    const frontCost = troops
      .getByRole('img', { name: 'Funding cost: 0 spice per dialed troop' })
      .getBoundingClientRect();
    const backCost = troops
      .getByRole('img', { name: 'Funding cost: 2 spice per dialed troop' })
      .getBoundingClientRect();
    const count = troops.getByRole('img', { name: '1 troop token' }).getBoundingClientRect();
    expect(frontCost.right).toBeLessThanOrEqual(flip.left);
    expect(backCost.right).toBeLessThanOrEqual(count.left);
  },
});

const withPlanets = (description = true) =>
  db((baseline) => {
    baseline.factions = [
      {
        ...faction({
          name: spaceOrks.name,
          data: {
            ...spaceOrks,
            planet: spaceOrks.planet.map((planet) => ({
              ...planet,
              description: description ? planet.description : '',
            })),
          },
        }),
        $key: 'faction:space-orks',
      },
    ];
    Object.assign(baseline.profiles[0], spaceOrksOwner);
    baseline.ruleset_factions = [];
    baseline.publication_jobs = [];
    baseline.publication_assets = [
      {
        asset_type: 'faction_sheet',
        asset_id: refText('faction:space-orks', SEED_REF_TOKEN),
        ...spaceOrksPublication,
      },
    ];
  });

export const DetailWithPlanets = meta.story({
  args: { path: '/factions/space-orks' },
  parameters: { database: withPlanets(), identity: null },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const sidebar = await page.findByRole('complementary', { name: 'Faction details' });
    const planets = within(sidebar).getByRole('region', { name: 'Planets' });
    const planet = within(planets).getByRole('listitem', { name: 'Space Hulk Leviathan' });
    expect(planet).toHaveAccessibleDescription(spaceOrks.planet[0].description);
    await userEvent.hover(planet);
    await expect(page.findByRole('tooltip')).resolves.toHaveTextContent(spaceOrks.planet[0].description);
    await userEvent.unhover(planet);
    await waitFor(() => expect(page.queryByRole('tooltip')).not.toBeInTheDocument());

    planet.focus();
    await userEvent.tab({ shift: true });
    await userEvent.tab();
    expect(planet).toHaveFocus();
    await expect(page.findByRole('tooltip')).resolves.toHaveTextContent(spaceOrks.planet[0].description);
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(page.queryByRole('tooltip')).not.toBeInTheDocument());
  },
});

export const DetailWithPlanetsMobile = meta.story({
  args: { path: '/factions/space-orks' },
  parameters: { database: withPlanets(), identity: null },
  globals: { viewport: { value: 'appMobile' } },
});

export const DetailWithUndescribedPlanet = meta.story({
  args: { path: '/factions/space-orks' },
  parameters: { database: withPlanets(false), identity: null },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const planet = await page.findByRole('listitem', { name: 'Space Hulk Leviathan' });
    await userEvent.hover(planet);
    expect(page.queryByRole('tooltip')).not.toBeInTheDocument();
    expect(planet).not.toHaveAccessibleDescription();
    expect(planet.tabIndex).toBe(-1);
    await userEvent.unhover(planet);
  },
});
export const Create = meta.story({ args: { path: '/factions/create' } });
export const Edit = meta.story({ args: { path: '/factions/house-atreides/edit' } });

/**
 * Escape closes the sheet review opened from the toolbar, while the pointer still rests on the button that opened it.
 * That button's tooltip is open then, and Mantine's tooltip stops the keydown on the document, so the review listens in the capture phase.
 */
export const EditEscapeClosesTheSheetReview = meta.story({
  args: { path: '/factions/house-atreides/edit' },
  globals: { viewport: { value: 'appLarge' } },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const review = () => canvasElement.ownerDocument.querySelector('[data-faction-sheet-review]');
    await userEvent.click(await page.findByRole('button', { name: 'Review faction sheet' }, { timeout: 30_000 }));
    /* The review plane opens from inside a second animation-frame callback, so each poll runs the waiting frames itself. */
    await waitForFrame(() => expect(review()?.hasAttribute('data-review-open')).toBe(true), { timeout: 30_000 });
    await expect(page.findByRole('tooltip', { name: 'Review faction sheet' })).resolves.toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(review()?.hasAttribute('data-review-open')).toBe(false));
  },
});

/* A current faction sheet with a replacement capture that failed after it (#1318, #1385). */
const currentSheetWithAFailedReplacement = db((baseline) => {
  const factionId = refText('faction:house-atreides', SEED_REF_TOKEN);
  baseline.publication_assets.push({
    asset_type: 'faction_sheet',
    asset_id: factionId,
    cache_token: 'storybook-sheet',
    published_at: Date.parse('2026-01-01T12:00:00.000Z'),
  });
  baseline.publication_jobs.push({
    asset_type: 'faction_sheet',
    asset_id: factionId,
    asset_data: {},
    status: 'error',
    attempt_counter: 10,
    error: 'Storybook capture failure',
    created_at: Date.parse('2026-01-01T13:00:00.000Z'),
    updated_at: Date.parse('2026-01-01T13:10:00.000Z'),
  });
});

/**
 * Someone who can edit the faction is told when a replacement capture failed beside a current sheet (#1385).
 * The previous sheet stays published (CONTEXT.md, Asset publication state), so the words say it may be out of date, and the published PDF stays on offer.
 */
export const DetailTellsItsEditorsAReplacementFailed = meta.story({
  args: { path: '/factions/house-atreides' },
  parameters: { database: currentSheetWithAFailedReplacement },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    /* Confirms this viewer can edit, so this story and the reader's one cover both kinds of viewer. */
    await expect(page.findByRole('link', { name: 'Edit faction' }, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(
      page.findByText('The published faction sheet may be out of date because the latest changes were not captured.')
    ).resolves.toBeVisible();
    await expect(page.findByText('Update failed')).resolves.toBeVisible();
    expect(page.queryByText('Current')).toBeNull();
    await expect(page.findByRole('link', { name: 'Open published PDF' })).resolves.toBeVisible();
  },
});

/**
 * A reader is told the same, since the sheet they download may be out of date (#1385).
 * The published PDF stays on offer beside it.
 */
export const DetailTellsReadersAReplacementFailed = meta.story({
  args: { path: '/factions/house-atreides' },
  parameters: { database: currentSheetWithAFailedReplacement, identity: null },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      page.findByText(
        'The published faction sheet may be out of date because the latest changes were not captured.',
        {},
        { timeout: 30_000 }
      )
    ).resolves.toBeVisible();
    await expect(page.findByText('Update failed')).resolves.toBeVisible();
    expect(page.queryByText('Current')).toBeNull();
    expect(page.queryByRole('link', { name: 'Edit faction' })).toBeNull();
    await expect(page.findByRole('link', { name: 'Open published PDF' })).resolves.toBeVisible();
  },
});

/* A faction with no published sheet whose first capture failed (#1385). */
const noSheetWithAFailedCapture = db((baseline) => {
  baseline.publication_jobs.push({
    asset_type: 'faction_sheet',
    asset_id: refText('faction:house-atreides', SEED_REF_TOKEN),
    asset_data: {},
    status: 'error',
    attempt_counter: 10,
    error: 'Storybook capture failure',
    created_at: Date.parse('2026-01-01T13:00:00.000Z'),
    updated_at: Date.parse('2026-01-01T13:10:00.000Z'),
  });
});

/**
 * With no sheet published yet, a failed capture was not an update, so the badge says the publish failed (#1385).
 */
export const DetailTellsReadersTheFirstPublishFailed = meta.story({
  args: { path: '/factions/house-atreides' },
  parameters: { database: noSheetWithAFailedCapture, identity: null },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      page.findByText(
        'The latest changes were not captured, so no faction sheet is published yet.',
        {},
        { timeout: 30_000 }
      )
    ).resolves.toBeVisible();
    await expect(page.findByText('Publish failed')).resolves.toBeVisible();
    expect(page.queryByText('Update failed')).toBeNull();
    expect(page.queryByRole('link', { name: 'Open published PDF' })).toBeNull();
  },
});

/* The faction leader's name is a field `factionAuthoringWarnings` answers for.
   The faction's own name is not: an empty one is `isNameBlank`, which drives the toolbar and an inline
   field error and contributes nothing to the header's list, so a regression written against it would
   pass whatever the header did. */
async function raiseAWarning(page: ReturnType<typeof within>) {
  await userEvent.click(await page.findByRole('tab', { name: 'Faction leader' }, { timeout: 30_000 }));
  const leaderName = await page.findByRole('textbox', { name: 'Faction leader name' }, { timeout: 30_000 });
  await userEvent.clear(leaderName);
  await expect(page.findByText('Needs attention', {}, { timeout: 30_000 })).resolves.toBeVisible();
}

/**
 * A faction that is not there declares the same band as one that is (#660).
 *
 * Six pages used to answer the "what kind of page is this" question twice: `default` while they had no data, `compact` once they had it.
 * The band carries `transition: height 0.2s ease-out`, so the reader watched it collapse by 143px as the page resolved, with everything below moving up with it.
 *
 * The assertion is the declaration rather than the pixel height, because the height is CSS's answer to the declaration and asserting it here would make this story a second copy of the stylesheet.
 */
export const DetailNotFoundDeclaresTheLoadedBand = meta.story({
  args: { path: '/factions/no-such-faction' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    /* Confirms this is a placeholder state and not a loaded page that happens to agree. */
    await expect(page.findByText('Back to factions', {}, { timeout: 30_000 })).resolves.toBeVisible();

    const root = canvasElement.ownerDocument.querySelector('[data-page-layout-header-size]');
    expect(root?.getAttribute('data-page-layout-header-size')).toBe('compact');
  },
});

/**
 * Reset closes the band it opened, rather than leaving the strip standing with nothing in it.
 *
 * Reset is a settle: discrete, deliberate, and exactly as much a "the draft has stopped moving" signal as the chapter switch that already counts as one.
 * The blur that comes from clicking Reset does not save it, because it lands one render too early, so this only passes if the reset itself releases the header.
 * Asserting the chip first is what stops this passing when no band ever opened.
 *
 * The band's own attribute is what closure is read from, not the absence of the strip's words.
 * Those two used to mean the same thing.
 * Since #897 the strip renders nothing whenever the warnings are empty, so an absent "Needs attention" now says only that the count reached zero, which it does on the keystroke, and a version of this page that never released the header would still satisfy it.
 */
export const EditResetClosesTheValidationBand = meta.story({
  args: { path: '/factions/house-atreides/edit' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const body = canvasElement.ownerDocument.body;
    await raiseAWarning(page);
    await expect(body.querySelector('[data-page-layout-header-size]')).not.toBeNull();
    await userEvent.click(page.getByRole('button', { name: 'Reset unsaved edits' }));
    await waitFor(() => expect(body.querySelector('[data-page-layout-header-size]')).toBeNull(), { timeout: 30_000 });
  },
});

/**
 * Reset discards the manual complexity rating the editor was holding for you (#894, graded breaks-rule under #608).
 *
 * Switching the rating off keeps it, so switching back on restores what you set rather than snapping to the calculated one.
 * That keep used to be `useState` inside the form fields, which a Reset arriving through TanStack Form does not remount, so a discarded rating was written back into a fresh draft.
 * It lives in the authoring session now, cleared on the same wrapper every replace path passes through.
 *
 * The inactive slider is the assertion because it already shows the keep: it reads the retained rating when there is one and the calculated rating when there is not, so the two outcomes differ without touching the switch again.
 * The rating is moved off the calculated value first, since a keep equal to the calculation would be invisible whichever way this went.
 *
 * The wait between Reset and the re-read reads the band's own attribute, for the reason given on EditResetClosesTheValidationBand.
 * Since #897 an absent "Needs attention" says only that the count reached zero, which happens a settle before the band closes, so a page that never released the header would clear this wait and the re-read would run against a draft mid-reset.
 */
export const EditResetDiscardsTheRetainedComplexity = meta.story({
  args: { path: '/factions/house-atreides/edit' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const body = canvasElement.ownerDocument.body;
    const openComplexity = async () =>
      await userEvent.click(await page.findByRole('tab', { name: 'Complexity' }, { timeout: 30_000 }));
    const manualSwitch = async () =>
      await page.findByRole('switch', { name: 'Set the rating manually' }, { timeout: 30_000 });
    /* Read only while the switch is on: Mantine hides the thumb with `display: none` while the slider is disabled, and that is what takes it out of the accessibility tree rather than the disabled state itself. */
    const thumb = async () =>
      await page.findByRole('slider', { name: 'Manual complexity rating' }, { timeout: 30_000 });
    /* Pinned non-null: `Number(null)` is 0, which would silently pick a direction rather than fail. */
    const rating = async () => (await thumb()).getAttribute('aria-valuenow') ?? '';

    await openComplexity();
    await userEvent.click(await manualSwitch());
    const calculated = await rating();

    /*
     * Away from the calculated value, in whichever direction the scale has room for.
     * The thumb is driven by focus plus a key rather than by typing into it: it is a div with
     * `role="slider"`, so it takes keydown but has no value to type into.
     */
    (await thumb()).focus();
    await userEvent.keyboard(Number(calculated) >= 5 ? '{ArrowLeft>3/}' : '{ArrowRight>3/}');
    /* Read where it landed rather than predicting it: the scale clamps at both ends and the step is the widget's business. */
    await waitFor(async () => expect(await rating()).not.toBe(calculated), { timeout: 30_000 });

    /* Switching off is what files the rating, and returns the draft to its stored shape. */
    await userEvent.click(await manualSwitch());
    /* So something else has to arm the Reset. */
    await raiseAWarning(page);
    await userEvent.click(page.getByRole('button', { name: 'Reset unsaved edits' }));
    await waitFor(() => expect(body.querySelector('[data-page-layout-header-size]')).toBeNull(), { timeout: 30_000 });

    await openComplexity();
    await userEvent.click(await manualSwitch());
    await expect(await rating()).toBe(calculated);
  },
});

/**
 * A random recipe files the gradient it replaces, because it changes a layer's mode without any flip.
 *
 * The mode memory is written where a layer's mode is about to change, and for a long time that meant the flip control alone.
 * Random colours applies one of six recipes and four of them carry a gradient, so a click routinely swaps a layer from linear to solid with no flip to file the outgoing value, and the crafted gradient went with it.
 *
 * The recipe is drawn at random and one of the six leaves the pattern layer linear, which is the one draw this cannot read: there would be no mode to flip back from.
 * So it re-crafts and draws again, bounded, and fails loudly rather than passing on a draw that proves nothing.
 */
export const EditRandomColorsFilesTheGradientItReplaces = meta.story({
  args: { path: '/factions/house-atreides/edit' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await openLayerEditor(page, 'pattern');

    /*
     * The bound is what makes this safe to keep rather than cruft to delete: one recipe in six is the
     * unreadable draw, so eight draws put a false failure near one in 1.7 million, and the hard
     * assertion sits outside the loop so an exhausted search fails rather than passes quietly.
     * If this ever does fail on that assertion, the probability argument has been beaten and the fix
     * is a seed seam in the randomizers, not a rerun.
     */
    let landed = 'linear';
    for (let draw = 0; draw < 8 && landed === 'linear'; draw += 1) {
      await craftLinearAngle(page, 'pattern', '135');
      await userEvent.click(page.getByRole('button', { name: 'Random colors' }));
      await waitFor(async () => expect(await currentLayerMode(page, 'pattern')).not.toBe('linear'), {
        timeout: 2000,
      }).catch(() => undefined);
      landed = await currentLayerMode(page, 'pattern');
    }
    expect(landed).not.toBe('linear');

    /* The recipe replaced a linear gradient with no flip, so the memory is the only place 135 still exists. */
    await userEvent.click((await layerModeControl(page, 'pattern')).getByRole('radio', { name: 'Linear' }));
    await expect(page.findByRole('textbox', { name: 'Gradient angle' }, { timeout: 30_000 })).resolves.toHaveValue(
      '135°'
    );
  },
});

/**
 * Reset discards the gradient the composer was keeping for you, the mechanism PR #850 removed from the token widgets.
 *
 * `BackgroundComposer` remembered the last value per colour mode so flipping solid/linear/radial and back restored what you had.
 * The memory was a ref, and a Reset arriving through TanStack Form replaces the draft without remounting the composer, so the ref stood and a flip afterwards restored a gradient the author had already discarded.
 *
 * The angle is the assertion rather than the mode, because both outcomes land on a linear gradient;
 * only its shape tells them apart.
 * With the memory discarded, Linear is derived afresh from the restored solid and opens at 90 degrees.
 * With the memory surviving, it reopens at the 135 typed before the Reset.
 */
export const EditResetDiscardsTheKeptGradient = meta.story({
  args: { path: '/factions/house-atreides/edit' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await openLayerEditor(page, 'pattern');
    /* The stored pattern layer is a solid, so choosing Linear is what gives the composer a gradient to keep. */
    await craftLinearAngle(page, 'pattern', '135');
    await flipAwayToRadial(page, 'pattern');
    await resetAndSettle(page);
    await expectFreshLinear(page, 'pattern');
  },
});

/**
 * Reset closes the create page's band, now that create gates its header like every other editor (#921).
 *
 * This page used to be the exception whose band carried the title and stayed mounted either way, so its stories asserted the masthead's words returning.
 * With the masthead gone the band-attribute assertion stops being vacuous here and becomes the same closure read the edit twin uses, for the reason given on EditResetClosesTheValidationBand.
 */
export const CreateResetClosesTheValidationBand = meta.story({
  args: { path: '/factions/create' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const body = canvasElement.ownerDocument.body;
    /* Anchor on the rendered page before the null read, or the empty shell satisfies it (the zero-count trap). */
    await page.findByRole('textbox', { name: 'Faction name' }, { timeout: 30_000 });
    expect(body.querySelector('[data-page-layout-header-size]')).toBeNull();
    await raiseAWarning(page);
    expect(body.querySelector('[data-page-layout-header-size]')).not.toBeNull();
    await userEvent.click(page.getByRole('button', { name: 'Reset unsaved edits' }));
    await waitFor(() => expect(body.querySelector('[data-page-layout-header-size]')).toBeNull(), { timeout: 30_000 });
  },
});

/**
 * Loading a draft over the current one clears the band as well, which Reset alone would not have covered.
 *
 * Load replaces the draft from the toolbar, outside the editor's blur capture entirely, so no settle reaches the header on its own.
 * It is the second release the browser pass found, and the reason the release belongs to the settle counter rather than to twelve reset handlers.
 *
 * This runs on the create page because the story database holds one faction and the edit page's picker excludes the faction being edited, so there is nothing to load there.
 * Since #921 removed the masthead gate that used to clear the strip regardless, the band closing here rides the release alone, which makes this the end-to-end check of it rather than a shadow of the page's own structure.
 */
export const CreateLoadClosesTheValidationBand = meta.story({
  args: { path: '/factions/create' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const body = canvasElement.ownerDocument.body;
    await raiseAWarning(page);
    expect(body.querySelector('[data-page-layout-header-size]')).not.toBeNull();
    await userEvent.click(page.getByRole('button', { name: 'Load existing faction' }));
    await userEvent.click((await waitForFrame(() => page.getAllByRole('option'), { timeout: 30_000 }))[0]!);
    await userEvent.click(await page.findByRole('button', { name: 'Load faction' }, { timeout: 30_000 }));
    await waitFor(() => expect(body.querySelector('[data-page-layout-header-size]')).toBeNull(), { timeout: 30_000 });
  },
});

const FACTION_EDIT_STATUSES = ['No unsaved changes', 'The public asset will be available soon.'];

/**
 * The faction editor's toolbar at a phone, tablet, laptop and desktop width, on one line at each (#1423).
 * The seeded faction states two things at rest, both behind the Status action: nothing unsaved, and no publication yet.
 */
export const EditToolbarAt360 = meta.story({
  args: { path: '/factions/house-atreides/edit' },
  globals: { viewport: { value: 'appMobileNarrow' } },
  play: async ({ canvasElement }) =>
    await expectToolbarOnOneLine(canvasElement, { statusDescribes: FACTION_EDIT_STATUSES }),
});
export const EditToolbarAt390 = meta.story({
  args: { path: '/factions/house-atreides/edit' },
  globals: { viewport: { value: 'appMobile' } },
  play: async ({ canvasElement }) =>
    await expectToolbarOnOneLine(canvasElement, { statusDescribes: FACTION_EDIT_STATUSES }),
});
export const EditToolbarAt768 = meta.story({
  args: { path: '/factions/house-atreides/edit' },
  globals: { viewport: { value: 'appTablet' } },
  play: async ({ canvasElement }) =>
    await expectToolbarOnOneLine(canvasElement, { statusDescribes: FACTION_EDIT_STATUSES }),
});
export const EditToolbarAt1100 = meta.story({
  args: { path: '/factions/house-atreides/edit' },
  globals: { viewport: { value: 'appLaptop' } },
  play: async ({ canvasElement }) =>
    await expectToolbarOnOneLine(canvasElement, { statusDescribes: FACTION_EDIT_STATUSES }),
});
export const EditToolbarAt1440 = meta.story({
  args: { path: '/factions/house-atreides/edit' },
  globals: { viewport: { value: 'appLarge' } },
  play: async ({ canvasElement }) =>
    await expectToolbarOnOneLine(canvasElement, { statusDescribes: FACTION_EDIT_STATUSES }),
});

/**
 * The faction editor with its name cleared (#1423): Save is held, and its description says why, after the unsaved changes and before the publication.
 * No caller puts a wider row in the bar: the complexity ring and every kind of action ending in Save.
 */
export const EditToolbarWithBlankNameAt552 = meta.story({
  args: { path: '/factions/house-atreides/edit' },
  globals: { viewport: { value: 'appAuthoringToolbarUnfolded' } },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.clear(await page.findByRole('textbox', { name: 'Faction name' }, { timeout: 30_000 }));
    await expectToolbarOnOneLine(canvasElement, {
      statusDescribes: [
        'Unsaved changes',
        'Add a faction name before saving; it determines the faction URL.',
        'The public asset will be available soon.',
      ],
    });
  },
});
