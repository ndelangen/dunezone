import preview from '@sb/preview';
import { expect, userEvent, within } from 'storybook/test';

import { convexNeverAnswers, db, ref, storybookViewer } from '@db/storybook';

import { pageStoryMeta } from '../../storybookConfig';
import { productDatabase } from './product.stories.fixture';

/* No account carries the Administrator flag: creation is open to every signed-in player. */
const signedIn = {
  identity: { ...storybookViewer, sessionKey: 'create-session' },
  database: db((baseline) => {
    productDatabase(baseline);
    for (const user of baseline.users) {
      user.isAdmin = false;
    }
    baseline.authSessions.push({
      $key: 'create-session',
      userId: ref(storybookViewer.subjectKey),
      expirationTime: 4_102_444_800_000,
    });
    baseline.authRefreshTokens.push({ sessionId: ref('create-session'), expirationTime: 4_102_444_800_000 });
  }),
};

const meta = preview.meta({
  ...pageStoryMeta,
  title: 'Play/Create',
  args: { path: '/play/create' },
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
      '/auth/login'
    );
    expect(page.queryByRole('button', { name: 'Create game' })).toBeNull();
  },
});

/** The baseline ruleset links a treachery deck and no spice deck, so the directory objects and creation stays disabled. */
export const Member = meta.story({
  parameters: signedIn,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const create = await page.findByRole('button', { name: 'Create game' }, { timeout: 30_000 });
    expect(create).toBeDisabled();
    await userEvent.click(page.getByPlaceholderText('Choose a ruleset'));
    await userEvent.click(await page.findByRole('option', { name: 'Dreamrules' }));
    await expect(page.findByRole('status')).resolves.toHaveTextContent('No spice deck is linked.');
    expect(page.getByLabelText('Minimum players')).toHaveValue('6');
    expect(create).toBeDisabled();
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
    expect(page.getByRole('link', { name: 'Go back home' })).toHaveAttribute('href', '/');
    expect(page.queryByText('Loading rulesets')).toBeNull();
  },
});

const creatable = {
  ...signedIn,
  database: db((baseline) => {
    productDatabase(baseline);
    baseline.users[0]!.isAdmin = false;
    baseline.authSessions.push({
      $key: 'create-session',
      userId: ref(storybookViewer.subjectKey),
      expirationTime: 4_102_444_800_000,
    });
    baseline.authRefreshTokens.push({ sessionId: ref('create-session'), expirationTime: 4_102_444_800_000 });
    const treachery = baseline.ruleset_asset_slots.find((slot) => slot.slot === 'treachery')!;
    baseline.ruleset_asset_slots.push({ ...treachery, slot: 'spice' });
    baseline.play_game_slug_reservations.push({ slug: 'arrakeen-picnic' });
  }),
};

async function chooseRuleset(page: ReturnType<typeof within>) {
  await userEvent.click(await page.findByPlaceholderText('Choose a ruleset', {}, { timeout: 30_000 }));
  await userEvent.click(await page.findByRole('option', { name: 'Dreamrules' }));
}

/** A reserved address is advice, never a validation error. */
export const DuplicateName = meta.story({
  parameters: creatable,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await chooseRuleset(page);
    await userEvent.type(page.getByLabelText('Game name'), 'Arrakeen picnic');
    await expect(page.findByText(/You can keep the name/, {}, { timeout: 10_000 })).resolves.toBeVisible();
    expect(page.getByLabelText('Game name')).not.toHaveAttribute('aria-invalid', 'true');
    expect(page.getByRole('button', { name: 'Create game' })).toBeEnabled();
  },
});

/** Local detection keeps every field for correction. */
export const NameRefused = meta.story({
  parameters: creatable,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await chooseRuleset(page);
    await userEvent.type(page.getByLabelText('Game name'), 'Fuck the spice harvest');
    await userEvent.clear(page.getByLabelText('Minimum players'));
    await userEvent.type(page.getByLabelText('Minimum players'), '4');
    await userEvent.click(page.getByRole('button', { name: 'Create game' }));
    await expect(
      page.findByText(/Choose a game name without profanity/, {}, { timeout: 10_000 })
    ).resolves.toBeVisible();
    expect(page.getByLabelText('Game name')).toHaveValue('Fuck the spice harvest');
    expect(page.getByRole('combobox', { name: 'Ruleset' })).toHaveValue('Dreamrules');
    expect(page.getByLabelText('Minimum players')).toHaveValue('4');
  },
});

/** Storybook has no provider credentials or network; its real action accepts the name when checking is unavailable. */
export const CustomNameCreated = meta.story({
  parameters: creatable,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await chooseRuleset(page);
    await userEvent.type(page.getByLabelText('Game name'), 'Arrakeen picnic');
    await userEvent.click(page.getByRole('button', { name: 'Create game' }));
    await expect(
      page.findByRole('heading', { name: 'Arrakeen picnic', level: 1 }, { timeout: 30_000 })
    ).resolves.toBeVisible();
    await expect(page.findByText(/\/play\/arrakeen-picnic-1$/)).resolves.toBeVisible();
    expect(page.getByRole('button', { name: 'Copy game link' })).toBeVisible();
  },
});

/** Leaving the optional name blank retains the generated-name creation path. */
export const GeneratedNameCreated = meta.story({
  parameters: creatable,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await chooseRuleset(page);
    await userEvent.click(page.getByRole('button', { name: 'Create game' }));
    await expect(page.findByText(/\/play\/[a-z-]+$/, {}, { timeout: 30_000 })).resolves.toBeVisible();
    expect(page.getByRole('heading', { level: 1 })).not.toHaveTextContent('Create a game');
  },
});
