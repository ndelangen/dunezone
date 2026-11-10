import { testingPreview } from '@sb/preview';
import { useEffect } from 'react';
import { expect, spyOn, userEvent, waitFor, within } from 'storybook/test';

import { convexNeverAnswers, db, ref, STORYBOOK_NOW, storybookViewer, useStorybookDatabaseClient } from '@db/storybook';

import { pageStoryMeta } from '../../storybookConfig';
import { signedIn, creatable, creatableDatabase, chooseRuleset, typeCustomName } from './create.route.stories.fixture';
import { productDatabase } from './product.stories.fixture';

const meta = testingPreview.meta({
  ...pageStoryMeta,
  title: 'Play/Create',
  args: { path: '/play/create' },
});

const creationDatabase: { client: ReturnType<typeof useStorybookDatabaseClient> | null } = { client: null };

function ObserveCreation() {
  const client = useStorybookDatabaseClient();
  useEffect(() => {
    creationDatabase.client = client;
    return () => {
      creationDatabase.client = null;
    };
  }, [client]);
  return null;
}

export const DiscordVoiceChosen = meta.story({
  parameters: { ...creatable, database: db(creatableDatabase, { discordVoice: true }) },
  decorators: [
    (Story) => (
      <>
        <ObserveCreation />
        <Story />
      </>
    ),
  ],
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await chooseRuleset(page);
    const action = spyOn(creationDatabase.client!, 'action');
    const voice = page.getByRole('switch', { name: 'Discord voice chat' });
    await expect(voice).not.toBeChecked();
    await expect(voice).toHaveAccessibleDescription(
      'Give this game its own Discord voice channel. Anyone with its invite can join.'
    );
    await userEvent.click(voice);
    await userEvent.click(page.getByRole('button', { name: 'Create game' }));
    await waitFor(
      async () => {
        await expect(page.getByRole('button', { name: 'Copy game link' })).toBeVisible();
        await expect(action).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({ discordVoice: true }),
          expect.anything()
        );
      },
      { timeout: 30_000 }
    );
  },
});

/** The baseline ruleset links a treachery deck and no spice deck, so the directory objects and creation stays disabled. */
export const Member = meta.story({
  parameters: signedIn,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const create = await page.findByRole('button', { name: 'Create game' }, { timeout: 30_000 });
    await expect(create).toHaveAttribute('aria-disabled', 'true');
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
    await expect(create).toHaveAttribute('aria-disabled', 'true');
  },
});

/** The rulesets never arrive, so after ten seconds the page says the server can't be reached and offers the lobby. */
export const ServerUnreachable = meta.story({
  decorators: [convexNeverAnswers],
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      page.findByText("Can't reach the server. Retrying...", {}, { timeout: 30_000 })
    ).resolves.toBeVisible();
    await expect(page.getByRole('link', { name: 'Go home' })).toHaveAttribute('href', '/');
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
    await expect(page.queryByRole('switch', { name: 'Discord voice chat' })).toBeNull();
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
    await expect(page.getByRole('button', { name: 'Create game' })).not.toHaveAttribute('aria-disabled', 'true');
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
    await expect(page.getByRole('button', { name: 'Create game' })).toHaveAttribute('aria-disabled', 'true');
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

export const DiscordVoicePhone = meta.story({
  parameters: { ...creatable, database: db(creatableDatabase, { discordVoice: true }) },
  globals: { viewport: { value: 'appMobileNarrow' } },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await chooseRuleset(page);
    const voice = page.getByRole('switch', { name: 'Discord voice chat' });
    await expect(voice).toHaveAccessibleDescription(
      'Give this game its own Discord voice channel. Anyone with its invite can join.'
    );
    await expect(voice).not.toBeChecked();
    await userEvent.click(voice);
    await expect(voice).toBeChecked();
  },
});

export const DiscordVoiceLimit = meta.story({
  parameters: {
    ...creatable,
    database: db(
      (baseline) => {
        creatableDatabase(baseline);
        for (let index = 0; index < 3; index += 1) {
          const gameKey = `voice-limit-game-${index}`;
          baseline.play_games.push({
            $key: gameKey,
            name: baseline.rulesets[0]!.name,
            slug: `voice-limit-game-${index}`,
            state: 'ready',
            ruleset_id: ref(baseline.rulesets[0]!.$key!),
            minimum_players: 6,
            creator_id: ref(storybookViewer.subjectKey),
            secret: 'story-only-secret',
            attempt_id: 'story-attempt',
            created_at: STORYBOOK_NOW,
            provision_expires_at: STORYBOOK_NOW,
          });
          baseline.play_game_discord_channels.push({
            game_id: ref(gameKey),
            creator_id: ref(storybookViewer.subjectKey),
            guild_id: '100',
            category_ids: ['200'],
            state: 'pending',
            created_at: STORYBOOK_NOW,
            cleanup_at: STORYBOOK_NOW + 14 * 86_400_000,
            next_attempt_at: STORYBOOK_NOW,
          });
        }
      },
      { discordVoice: true }
    ),
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await chooseRuleset(page);
    const voice = page.getByRole('switch', { name: 'Discord voice chat' });
    await expect(voice).toBeDisabled();
    await expect(voice).not.toBeChecked();
    await expect(voice).toHaveAccessibleDescription(
      'Voice chat is unavailable if you already have three active channels or while your account is merging. You can still create this game without voice chat.'
    );
    await expect(page.getByRole('button', { name: 'Create game' })).not.toHaveAttribute('aria-disabled', 'true');
  },
});
