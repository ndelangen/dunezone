import { isPublicationAssetType } from '@shared/asset-publishing/publicationTargets';
import type { within } from 'storybook/test';
import { expect, userEvent, waitFor } from 'storybook/test';

import { db, ref, refText, ruleset, SEED_REF_TOKEN, storybookViewer } from '@db/storybook';
import type { StorybookDatabase } from '@db/storybook';

import { factions, productDatabase } from './product.stories.fixture';

/* No account carries the Administrator flag: creation is open to every signed-in player. */
export const signedIn = {
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
    baseline.authRefreshTokens.push({
      sessionId: ref('create-session'),
      expirationTime: 4_102_444_800_000,
    });
  }),
};

/*
 * Every asset published, front and back, as the catalogue of a ruleset that is ready for Play has it.
 * The create page checks the chosen ruleset the way the table captures it, and refuses one whose faces are unpublished.
 */
export function publishEverything(baseline: StorybookDatabase) {
  for (const row of baseline.assets) {
    if (!row.$key || !isPublicationAssetType(row.type)) {
      continue;
    }
    for (const id of [SEED_REF_TOKEN, `${SEED_REF_TOKEN}.back`]) {
      baseline.publication_assets.push({
        asset_type: row.type,
        asset_id: refText(row.$key, id),
        cache_token: 'story',
        published_at: 0,
      });
    }
  }
}

/** The product catalogue a signed-in player creates from: two rulesets, every face published. */
export function creatableDatabase(baseline: StorybookDatabase) {
  productDatabase(baseline);
  baseline.users[0]!.isAdmin = false;
  baseline.authSessions.push({
    $key: 'create-session',
    userId: ref(storybookViewer.subjectKey),
    expirationTime: 4_102_444_800_000,
  });
  baseline.authRefreshTokens.push({
    sessionId: ref('create-session'),
    expirationTime: 4_102_444_800_000,
  });
  const treachery = baseline.ruleset_asset_slots.find((slot) => slot.slot === 'treachery')!;
  baseline.ruleset_asset_slots.push({ ...treachery, slot: 'spice' });
  baseline.play_game_slug_reservations.push({ slug: 'arrakeen-picnic' });
  publishEverything(baseline);
  /* A manifest worth reading: all six base factions, four of them shared with a second ruleset and two made for this one. */
  const [chosen] = baseline.rulesets;
  const classic = {
    ...ruleset({ name: 'Classic Dune' }),
    group_id: chosen!.group_id,
  };
  baseline.rulesets.push(classic);
  const [atreides] = baseline.factions;
  baseline.ruleset_factions.push({
    ruleset_id: ref(classic.$key!),
    faction_id: ref(atreides!.$key!),
    position: baseline.ruleset_factions.length,
  });
  for (const entry of factions.slice(1)) {
    const key = `faction:${entry.slug}`;
    baseline.factions.push({
      ...atreides!,
      $key: key,
      slug: entry.slug,
      data: entry.data,
    });
    baseline.ruleset_factions.push({
      ruleset_id: ref(chosen!.$key!),
      faction_id: ref(key),
      position: baseline.ruleset_factions.length,
    });
    if (!['spacing-guild', 'bene-gesserit'].includes(entry.slug)) {
      baseline.ruleset_factions.push({
        ruleset_id: ref(classic.$key!),
        faction_id: ref(key),
        position: baseline.ruleset_factions.length,
      });
    }
  }
}

export const creatable = { ...signedIn, database: db(creatableDatabase) };

export async function chooseRuleset(page: ReturnType<typeof within>) {
  await userEvent.click(await page.findByRole('combobox', { name: 'Ruleset' }, { timeout: 30_000 }));
  await userEvent.click(await page.findByRole('option', { name: /^Dreamrules/ }));
  /* The pass checks the chosen ruleset the way the table captures it before Create game is offered. */
  await waitFor(() => expect(page.queryByText(/^Checking every deck and bundle/)).toBeNull(), { timeout: 30_000 });
}

export async function typeCustomName(page: ReturnType<typeof within>, name: string) {
  await userEvent.click(page.getByRole('switch', { name: 'Set a custom name' }));
  await userEvent.type(page.getByLabelText('Custom name'), name);
}
