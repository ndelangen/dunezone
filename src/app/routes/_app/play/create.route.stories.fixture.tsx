import type { within } from 'storybook/test';
import { userEvent } from 'storybook/test';

import { db, ref, ruleset, storybookViewer } from '@db/storybook';

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
    baseline.authRefreshTokens.push({ sessionId: ref('create-session'), expirationTime: 4_102_444_800_000 });
  }),
};

export const creatable = {
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
    /* A manifest worth reading: all six base factions, four of them shared with a second ruleset and two made for this one. */
    const [chosen] = baseline.rulesets;
    const classic = { ...ruleset({ name: 'Classic Dune' }), group_id: chosen!.group_id };
    baseline.rulesets.push(classic);
    const [atreides] = baseline.factions;
    baseline.ruleset_factions.push({
      ruleset_id: ref(classic.$key!),
      faction_id: ref(atreides!.$key!),
      position: baseline.ruleset_factions.length,
    });
    for (const entry of factions.slice(1)) {
      const key = `faction:${entry.slug}`;
      baseline.factions.push({ ...atreides!, $key: key, slug: entry.slug, data: entry.data });
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
  }),
};

export async function chooseRuleset(page: ReturnType<typeof within>) {
  await userEvent.click(await page.findByRole('combobox', { name: 'Ruleset' }, { timeout: 30_000 }));
  await userEvent.click(await page.findByRole('option', { name: /^Dreamrules/ }));
}

export async function typeCustomName(page: ReturnType<typeof within>, name: string) {
  await userEvent.click(page.getByRole('switch', { name: 'Set a custom name' }));
  await userEvent.type(page.getByLabelText('Custom name'), name);
}
