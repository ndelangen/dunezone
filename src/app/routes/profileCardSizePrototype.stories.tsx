/*
 * PROTOTYPE, #1398. Throwaway, on prototype/1398-stacked-card-size, which never merges.
 *
 * The profile detail route with each stacked card size, on real rows copied into the story database.
 * The faction rows are the six product factions of the Play stories, copied from the public catalogue on 2026-09-21 (`_app/play/product.stories.fixture/factions.json`).
 * The profiles are two real public profiles with their avatars, from the snapshot in `_app/play/drafting.stories.fixture.ts`.
 * Which profile owns which faction is staged: Thialfi owns Fremen, and Twaffle owns the other five.
 * The Dreamrules ruleset row is the public record in `ruleset.json`, and every faction is linked to it as production lists them.
 * Pick a story, then flip the floating bar at the bottom, or set `?variant=a|b|c` on the route.
 * The variants differ only below a 720px window, where the two columns stack.
 */
import preview from '@sb/preview';
import { FactionInputSchema } from '@shared/factions/schema';
import { expect, waitFor, within } from 'storybook/test';

import type { StorybookDatabase } from '@db/storybook';
import { db, ref } from '@db/storybook';

import { PROFILES } from './_app/play/drafting.stories.fixture';
import capturedFactions from './_app/play/product.stories.fixture/factions.json';
import capturedRuleset from './_app/play/product.stories.fixture/ruleset.json';
import { pageStoryMeta } from './storybookConfig';

/**
 * Registers the prototype's image worker (`static/prototype-1398-published.sw.js`) and settles once it controls the page.
 * The worker answers the published token and leader URLs a faction card asks for with the product fixture images, since the story database gives each faction a fresh id the real publication never saw.
 */
async function servePublishedFixtures() {
  const serviceWorker: ServiceWorkerContainer | undefined = navigator.serviceWorker;
  if (!serviceWorker) {
    throw new Error(
      'This prototype serves its faction images with a service worker, and this page cannot register one.'
    );
  }
  const registration = await serviceWorker.register('/prototype-1398-published.sw.js');
  if (serviceWorker.controller?.scriptURL.endsWith('/prototype-1398-published.sw.js')) {
    return {};
  }
  const controlled = new Promise((resolve) =>
    serviceWorker.addEventListener('controllerchange', resolve, { once: true })
  );
  registration.active?.postMessage('claim');
  await controlled;
  return {};
}

const meta = preview.meta({
  title: 'Prototype 1398 stacked card size',
  ...pageStoryMeta,
  loaders: [servePublishedFixtures],
});

const STORY_TIME = '2026-09-21T12:00:00.000Z';

function realProfile(slug: string) {
  const profile = PROFILES.find((entry) => entry.slug === slug);
  if (!profile) {
    throw new Error(`The profile snapshot has no ${slug}.`);
  }
  return profile;
}

function realFaction(slug: string) {
  const entry = capturedFactions.find((candidate) => candidate.slug === slug);
  if (!entry) {
    throw new Error(`The product factions have no ${slug}.`);
  }
  return entry;
}

/** A database whose one real profile owns the named real factions, all linked to Dreamrules. */
function profileWithFactions(profileSlug: string, factionSlugs: readonly string[]) {
  return db((baseline: StorybookDatabase) => {
    const profile = realProfile(profileSlug);
    const userKey = `user:${profile.slug}`;
    const rulesetKey = `ruleset:${capturedRuleset.slug}`;
    /* The baseline's own House Atreides would share a slug with the real one. */
    baseline.factions = [];
    baseline.ruleset_factions = [];
    baseline.users.push({ $key: userKey, name: profile.username });
    baseline.profiles.push({
      $key: `profile:${profile.slug}`,
      user_id: ref(userKey),
      username: profile.username,
      avatar_url: profile.avatarUrl,
      account_state: 'active',
      slug: profile.slug,
      created_at: STORY_TIME,
      updated_at: STORY_TIME,
    });
    baseline.rulesets.push({
      $key: rulesetKey,
      name: capturedRuleset.name,
      slug: capturedRuleset.slug,
      about: capturedRuleset.about,
      owner_id: ref(userKey),
      group_id: null,
      is_deleted: false,
      image_cover: null,
      created_at: capturedRuleset.updated_at,
      updated_at: capturedRuleset.updated_at,
    });
    for (const slug of factionSlugs) {
      const entry = realFaction(slug);
      const factionKey = `faction:${entry.slug}`;
      baseline.factions.push({
        $key: factionKey,
        owner_id: ref(userKey),
        data: FactionInputSchema.parse(entry.data),
        slug: entry.slug,
        /* The copy holds no creation time; the update time stands in for it. */
        created_at: entry.updated_at,
        /* Kept as copied: the published image URLs carry it, and the prototype's image worker reads it back. */
        updated_at: entry.updated_at,
        is_deleted: false,
        group_id: null,
      });
      baseline.ruleset_factions.push({ ruleset_id: ref(rulesetKey), faction_id: ref(factionKey) });
    }
  });
}

const oneFaction = profileWithFactions('thialfi', ['fremen']);
const severalFactions = profileWithFactions('twaffle', [
  'house-atreides',
  'house-harkonnen',
  'emperor',
  'spacing-guild',
  'bene-gesserit',
]);

const waitForFactions =
  (count: number) =>
  async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await page.findByRole('heading', { name: 'Factions created' }, { timeout: 30_000 });
    await waitFor(
      () =>
        expect(canvasElement.ownerDocument.querySelectorAll('a[href^="/factions/"]').length).toBeGreaterThanOrEqual(
          count
        ),
      { timeout: 30_000 }
    );
  };

export const OneFactionA = meta.story({
  args: { path: '/profiles/thialfi' },
  parameters: { database: oneFaction },
  play: waitForFactions(1),
});
export const OneFactionB = meta.story({
  args: { path: '/profiles/thialfi?variant=b' },
  parameters: { database: oneFaction },
  play: waitForFactions(1),
});
export const OneFactionC = meta.story({
  args: { path: '/profiles/thialfi?variant=c' },
  parameters: { database: oneFaction },
  play: waitForFactions(1),
});

export const SeveralFactionsA = meta.story({
  args: { path: '/profiles/twaffle' },
  parameters: { database: severalFactions },
  play: waitForFactions(5),
});
export const SeveralFactionsB = meta.story({
  args: { path: '/profiles/twaffle?variant=b' },
  parameters: { database: severalFactions },
  play: waitForFactions(5),
});
export const SeveralFactionsC = meta.story({
  args: { path: '/profiles/twaffle?variant=c' },
  parameters: { database: severalFactions },
  play: waitForFactions(5),
});
