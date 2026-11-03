import { testingPreview } from '@sb/preview';
import { expect, spyOn, userEvent, waitFor, within } from 'storybook/test';

import { convexNeverAnswers, db, ref, storybookViewer } from '@db/storybook';

import { pageStoryMeta } from '../../storybookConfig';
import { signedIn, creatable, chooseRuleset, typeCustomName } from './create.route.stories.fixture';
import { productDatabase } from './product.stories.fixture';

const meta = testingPreview.meta({
  ...pageStoryMeta,
  title: 'Play/Create',
  args: { path: '/play/create' },
});

/** The baseline ruleset links a treachery deck and no spice deck, so the directory objects and creation stays disabled. */
export const Member = meta.story({
  parameters: signedIn,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const create = await page.findByRole('button', { name: 'Create game' }, { timeout: 30_000 });
    await expect(create).toBeDisabled();
    await userEvent.click(page.getByRole('combobox', { name: 'Ruleset' }));
    /* The dropdown says why a ruleset cannot start a game before it is chosen. */
    await expect(await page.findByRole('option', { name: /^Dreamrules/ })).toHaveTextContent(
      'No spice deck is linked.'
    );
    await userEvent.click(page.getByRole('option', { name: /^Dreamrules/ }));
    await expect(page.getByRole('combobox', { name: 'Ruleset' })).toHaveAccessibleDescription(
      'No spice deck is linked.'
    );
    await expect(page.findByRole('status')).resolves.toHaveTextContent('Dreamrules cannot start a game yet.');
    await expect(page.getByRole('slider', { name: 'Minimum players' })).toHaveAttribute('aria-valuenow', '6');
    await expect(create).toBeDisabled();
  },
});

/** The rulesets never arrive, so after ten seconds the page says the server can't be reached and offers the lobby. */
export const ServerUnreachable = meta.story({
  decorators: [convexNeverAnswers],
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      page.findByRole('heading', { name: "Can't reach the server" }, { timeout: 30_000 })
    ).resolves.toBeVisible();
    await expect(page.getByRole('link', { name: 'Go back home' })).toHaveAttribute('href', '/');
    await expect(page.queryByText('Loading rulesets')).toBeNull();
  },
});

/* The generated name sits under the line that introduces it. */
function shownName(page: ReturnType<typeof within>) {
  return page.getByText('This will be the name of your game').nextElementSibling?.textContent ?? '';
}

/** The pass opens on a generated name; the dice draw another and the stub counts the seats. */
export const Creatable = meta.story({
  parameters: creatable,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await chooseRuleset(page);
    const first = shownName(page);
    await expect(first).not.toBe('');
    /* One draw in 840 repeats the last, so three tries rule out chance. */
    for (let tries = 0; tries < 3 && shownName(page) === first; tries += 1) {
      await userEvent.click(page.getByRole('button', { name: 'Roll another name' }));
    }
    await expect(shownName(page)).not.toBe(first);
    await expect(page.getByRole('img', { name: '6 seats round the board' })).toBeVisible();
    page.getByRole('slider', { name: 'Minimum players' }).focus();
    await userEvent.keyboard('{ArrowRight}{ArrowRight}');
    await expect(page.getByRole('img', { name: '8 seats round the board' })).toBeVisible();
    await expect(page.getByRole('slider', { name: 'Last turn' })).toHaveAttribute('aria-valuenow', '10');
    await expect(page.getByRole('button', { name: 'Create game' })).toBeEnabled();
    /* The chosen ruleset's manifest is printed on the pass, its page a new tab away. */
    const manifest = within(
      await page.findByRole('region', { name: 'What Dreamrules puts on the table' }, { timeout: 10_000 })
    );
    await expect(manifest.getByText('Treachery deck')).toBeVisible();
    await expect(manifest.getAllByText('3 cards')).toHaveLength(2);
    await expect(manifest.getByText('Custom tokens')).toBeVisible();
    await expect(manifest.getByText('6 factions')).toBeVisible();
    await expect(manifest.getByText('Made for Dreamrules')).toBeVisible();
    await expect(manifest.getByText('Also in other rulesets')).toBeVisible();
    await expect(manifest.getByRole('link', { name: /Read the ruleset/ })).toHaveAttribute('target', '_blank');
  },
});

/** Local detection keeps every field for correction. */
export const NameRefused = meta.story({
  parameters: creatable,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await chooseRuleset(page);
    await typeCustomName(page, 'Fuck the spice harvest');
    page.getByRole('slider', { name: 'Minimum players' }).focus();
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}');
    await userEvent.click(page.getByRole('button', { name: 'Create game' }));
    await expect(
      page.findByText(/Choose a game name without profanity/, {}, { timeout: 10_000 })
    ).resolves.toBeVisible();
    await expect(page.getByLabelText('Custom name')).toHaveValue('Fuck the spice harvest');
    await expect(page.getByRole('combobox', { name: 'Ruleset' })).toHaveValue('Dreamrules');
    await expect(page.getByRole('slider', { name: 'Minimum players' })).toHaveAttribute('aria-valuenow', '4');
  },
});

/** Storybook has no provider credentials or network; its real action accepts the name when checking is unavailable. */
export const CustomNameCreated = meta.story({
  parameters: creatable,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await chooseRuleset(page);
    await typeCustomName(page, 'Arrakeen picnic');
    await userEvent.click(page.getByRole('button', { name: 'Create game' }));
    await expect(
      page.findByRole('heading', { name: 'Arrakeen picnic', level: 1 }, { timeout: 30_000 })
    ).resolves.toBeVisible();
    /* The menu shows no address; Copy game link puts the final one on the clipboard. */
    const writeText = spyOn(
      canvasElement.ownerDocument.defaultView!.navigator.clipboard,
      'writeText'
    ).mockResolvedValue();
    await userEvent.click(await page.findByRole('button', { name: 'Copy game link' }));
    await expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/\/play\/arrakeen-picnic-1$/));
    await expect(page.findByRole('button', { name: 'Game link copied' })).resolves.toBeVisible();
  },
});

/** The generated name the pass shows is the name the game gets. */
export const GeneratedNameCreated = meta.story({
  parameters: creatable,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await chooseRuleset(page);
    const name = shownName(page);
    await userEvent.click(page.getByRole('button', { name: 'Create game' }));
    /* Query the committed page each time, because a route update can replace the first share button. */
    await waitFor(
      async () => {
        await expect(page.getByRole('button', { name: 'Copy game link' })).toBeVisible();
        await expect(page.getByRole('heading', { level: 1 })).toHaveTextContent(name);
      },
      { timeout: 30_000 }
    );
  },
});

export const MissingBoard = meta.story({
  parameters: {
    ...signedIn,
    database: db((baseline) => {
      productDatabase(baseline);
      baseline.ruleset_asset_slots = baseline.ruleset_asset_slots.filter((slot) => slot.slot !== 'board');
      baseline.authSessions.push({
        $key: 'create-session',
        userId: ref(storybookViewer.subjectKey),
        expirationTime: 4_102_444_800_000,
      });
      baseline.authRefreshTokens.push({
        sessionId: ref('create-session'),
        expirationTime: 4_102_444_800_000,
      });
    }),
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('combobox', { name: 'Ruleset' }));
    const option = await page.findByRole('option', { name: /^Dreamrules/ });
    await expect(option).toHaveAttribute('data-combobox-disabled', 'true');
    await userEvent.click(option);
    await expect(page.getByRole('combobox', { name: 'Ruleset' })).toHaveValue('');
    await expect(option).toHaveTextContent('No usable board is linked.');
    await expect(page.getByRole('button', { name: 'Create game' })).toBeDisabled();
  },
});

export const SignedOut = meta.story({
  parameters: { identity: null },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      page.findByRole('heading', { name: 'Create a game', level: 1 }, { timeout: 30_000 })
    ).resolves.toBeVisible();
    await expect(page.findByRole('link', { name: 'Log in' }, { timeout: 30_000 })).resolves.toHaveAttribute(
      'href',
      /* Signing in returns the reader to the page they asked from. */
      '/auth/login?redirect=%2Fplay%2Fcreate'
    );
    await expect(page.queryByRole('button', { name: 'Create game' })).toBeNull();
  },
});
