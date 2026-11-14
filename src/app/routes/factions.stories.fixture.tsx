import { waitForFrame } from '@sb/storyWaits';
import { ensureFactionComponentIds } from '@shared/factions/componentIdentity';
import type { FactionInput } from '@shared/factions/schema';
import { INHERITABLE_FIELDS, variantProblems } from '@shared/factions/variantFields';
import type { InheritableField } from '@shared/factions/variantFields';
import { createMemoryHistory } from '@tanstack/react-router';
import type { RouterHistory } from '@tanstack/react-router';
import { drawnCover } from '@ui/list/RulesetCovers.stories.fixture';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { db, faction, ref, refText, ruleset, SEED_REF_TOKEN } from '@db/storybook';
import type { DatabaseDefinition, StorybookDatabase } from '@db/storybook';

import { spaceOrks, spaceOrksOwner, spaceOrksPublication } from './factionPlanets.stories.fixture';
import { expectWithinWidth } from './pagePlay';

/** Another member beside the viewer, with one faction in the viewer's ruleset, so the member's list and the ruleset's list differ. */
export function seedAnotherMember(baseline: StorybookDatabase) {
  baseline.users.push({ $key: 'other-member', name: 'Other member' });
  baseline.profiles.push({
    user_id: ref('other-member'),
    username: 'Other member',
    slug: 'other-member',
    avatar_url: null,
    account_state: 'active',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  });
  baseline.factions.push({ ...faction({ name: 'Sietch Tabr' }), owner_id: ref('other-member') });
  baseline.ruleset_factions.push({
    ruleset_id: ref('ruleset:classicrules'),
    faction_id: ref('faction:sietch-tabr'),
    position: baseline.ruleset_factions.length,
  });
}

/**
 * A story loader making the page's history, holding `entries` and open at the last, so the play function can walk it and read the address through `pageHistory`.
 * Made per run rather than at module level, since a story's module loads once and a history that carried over would start the next run mid-walk.
 */
export function memoryHistory(...entries: string[]) {
  return () => ({ history: createMemoryHistory({ initialEntries: entries }) });
}

/** The history `memoryHistory` loaded, as the render and the play function reach it. */
export function pageHistory(loaded: Record<string, unknown>) {
  return loaded.history as RouterHistory;
}

/** The grid's cards named `name`, read afresh on each call because a transition can replace the page's `main`. */
export function gridCards(page: ReturnType<typeof within>, name: RegExp) {
  return within(page.getByRole('main')).queryAllByRole('link', { name });
}

/** The story faction with its rules keeping the Treachery tracker, as the published Atreides will. */
export const withTreacheryTracker = db((baseline) => {
  const data = baseline.factions[0]!.data;
  data.rules = { ...data.rules, treacheryTracker: true };
});

export const withTroopDetails = db((baseline) => {
  const data = baseline.factions[0]!.data;
  const art = data.troops[0]!;
  data.troops = [
    {
      ...art,
      name: 'Soldiers',
      count: 15,
      description: 'The main fighting force.',
      capable: true,
      combat: { strength: 0.5, supportedStrength: 1 },
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
      combat: { strength: 1, supportedStrength: 2, supportCost: 2 },
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

export const withPlanets = (description = true) =>
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

/** The fade stays in the scroll padding, leaving both end leaders fully opaque. */
export async function expectLeaderLane(canvasElement: HTMLElement) {
  const page = within(canvasElement.ownerDocument.body);
  const leaders = await page.findByRole('region', { name: 'Leaders' });
  const tiles = within(leaders).getAllByRole('article');
  const lane = tiles[0]!.parentElement!;
  const style = getComputedStyle(lane);
  await expect(style.maskImage).not.toBe('none');
  const fadeWidths = [...style.maskImage.matchAll(/(?:black|rgb\(0, 0, 0\)) (?:calc\(100% - )?(\d+(?:\.\d+)?)px/g)].map(
    (match) => Number(match[1])
  );
  await expect(fadeWidths).toHaveLength(2);
  await expect(fadeWidths[0]).toBeLessThanOrEqual(Number.parseFloat(style.paddingLeft));
  await expect(fadeWidths[1]).toBeLessThanOrEqual(Number.parseFloat(style.paddingRight));
  await expectWithinWidth(canvasElement, [lane]);

  lane.scrollLeft = 0;
  await waitForFrame(async () => {
    await expect(tiles[0]!.getBoundingClientRect().left).toBeGreaterThanOrEqual(
      lane.getBoundingClientRect().left + fadeWidths[0]!
    );
  });
  lane.scrollLeft = lane.scrollWidth;
  await waitForFrame(async () => {
    await expect(tiles.at(-1)!.getBoundingClientRect().right).toBeLessThanOrEqual(
      lane.getBoundingClientRect().right - fadeWidths[1]! + 1
    );
  });
  lane.scrollLeft = 0;
}

/* A current faction sheet with a replacement capture that failed after it (#1318, #1385). */
export const currentSheetWithAFailedReplacement = db((baseline) => {
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

const FACTION_GROUP = 'group:landsraad-archivists';
const VARIANT_GROUP = 'group:arrakeen-rules-council';

/**
 * House Atreides owned by another member, with its Faction held by one Group and its one variant since moved to another.
 * A Faction keeps the Group its first variant started in, so the row is seeded in the Faction's Group and patched into the variant's.
 * The viewer belongs to the Arrakeen Rules Council alone, so naming it on either side decides which half of the editor is theirs.
 */
function maintainedByTwoGroups(groups: { faction: string; variant: string }) {
  return db((baseline) => {
    baseline.users.push({ $key: 'faction-owner', name: 'Chani Kynes' });
    baseline.profiles.push({
      user_id: ref('faction-owner'),
      username: 'Chani Kynes',
      slug: 'chani-kynes',
      avatar_url: null,
      account_state: 'active',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    });
    baseline.groups.push({
      $key: FACTION_GROUP,
      name: 'Landsraad Archivists',
      slug: 'landsraad-archivists',
      created_at: '2026-01-01T00:00:00Z',
      created_by: ref('faction-owner'),
      is_deleted: false,
    });
    baseline.factions[0] = {
      ...baseline.factions[0]!,
      $key: 'faction:house-atreides',
      owner_id: ref('faction-owner'),
      group_id: ref(groups.faction),
      $patch: { group_id: ref(groups.variant) },
    };
  });
}

/** The viewer maintains the variant through its Group, and has no part in the Faction's. */
export const variantMaintainerOutsideTheFactionGroup = maintainedByTwoGroups({
  faction: FACTION_GROUP,
  variant: VARIANT_GROUP,
});

/**
 * The same viewer, on the same Faction once its maintainers opened it: anyone signed in may add a variant (#2928).
 * A trigger makes the Faction, so opening it is a patch made after the seed rows exist.
 */
export const openFactionSeenFromOutsideItsGroup: DatabaseDefinition = {
  create: () => [
    ...variantMaintainerOutsideTheFactionGroup.create(),
    { operation: 'patch', key: 'faction:house-atreides:family', table: 'faction_families', value: { is_open: true } },
  ],
};

/** The viewer maintains the Faction through its Group, and has no part in the variant's. */
export const factionMaintainerOutsideTheVariantGroup = maintainedByTwoGroups({
  faction: VARIANT_GROUP,
  variant: FACTION_GROUP,
});

export const DREAMRULES_PATH = '/factions/house-atreides-dreamrules';

/** The fields Dreamrules keeps as its own; it follows Original, its parent, in every other one. */
const DREAMRULES_CUSTOM: readonly InheritableField[] = ['leaders', 'troops', 'rules.revivalText', 'rules.advantages'];

/**
 * House Atreides with a second variant, Dreamrules, whose parent is the Original (#2927).
 * `change` gives Dreamrules the data of its custom fields, which is all a child holds that its parent does not.
 * Its problems are the server's own words for what a save of that data would refuse.
 */
function withDreamrules(change: (parent: FactionInput) => FactionInput) {
  return db((baseline) => {
    const original = baseline.factions[0]!;
    const data = change(structuredClone(original.data));
    baseline.factions.push({
      ...original,
      $key: 'faction:house-atreides-dreamrules',
      $patch: undefined,
      slug: 'house-atreides-dreamrules',
      data,
      variant_name: 'Dreamrules',
      variant_slug: 'dreamrules',
      parent_id: ref('faction:house-atreides'),
      inherited: INHERITABLE_FIELDS.filter((field) => !DREAMRULES_CUSTOM.includes(field)),
      revision: 0,
      problems: variantProblems(ensureFactionComponentIds(data)),
    });
  });
}

/** Dreamrules renames a leader and its troop, revives more troops, and drops the first advantage. */
export const withAChildVariant = withDreamrules((parent) => ({
  ...parent,
  leaders: parent.leaders.map((leader, index) => (index === 0 ? { ...leader, name: 'Paul Atreides' } : leader)),
  troops: parent.troops.map((troop, index) => (index === 0 ? { ...troop, name: 'Fedaykin' } : troop)),
  rules: { ...parent.rules, revivalText: '3 troops free.', advantages: parent.rules.advantages.slice(1) },
}));

/**
 * Dreamrules after the Original removed Caladan, the planet both of the child's own troop types are stationed on (#2908).
 * The child follows the Original's planets, so the change reached it.
 */
export const withABrokenChildVariant = withDreamrules((parent) => ({
  ...parent,
  planet: [],
  troops: [
    { ...parent.troops[0]!, name: 'Fedaykin', planet: 'Caladan' },
    {
      ...parent.troops[0]!,
      troopId: 'a939da92-5f9f-4c50-a102-3bc437ffd1e6',
      name: 'House guard',
      planet: 'Caladan',
    },
  ],
}));

/** The catalogue's factions beside House Atreides, each with the rulesets it is in. */
const COVERED_FACTIONS = [
  { name: 'Fremen of the Deep Desert', rulesets: ['dreamrules', 'spring-cup', 'sietch-house-rules'] },
  { name: 'Spacing Guild', rulesets: ['sietch-house-rules'] },
  { name: 'Bene Tleilax', rulesets: [] },
] as const;

/**
 * A catalogue whose cards cite their rulesets by cover.
 * House Atreides is in six rulesets, the Fremen in three, the Guild in one and the Tleilaxu in none, and one ruleset has no cover, as most start out.
 */
export const withRulesetCovers = db((baseline) => {
  baseline.rulesets[0]!.image_cover = drawnCover('#27445c', '#c98a3c');
  baseline.rulesets.push(
    { ...ruleset({ name: 'Dreamrules' }), image_cover: drawnCover('#4a2d5e', '#d9a15a') },
    { ...ruleset({ name: 'Spring Cup' }), image_cover: drawnCover('#2f5a3f', '#e0c06a') },
    ruleset({ name: 'Sietch house rules' }),
    { ...ruleset({ name: 'Landsraad' }), image_cover: drawnCover('#1f4f55', '#d2a24c') },
    { ...ruleset({ name: 'Two players' }), image_cover: drawnCover('#5c2a27', '#e2b36b') }
  );
  for (const slug of ['dreamrules', 'spring-cup', 'sietch-house-rules', 'landsraad', 'two-players']) {
    baseline.ruleset_factions.push({
      ruleset_id: ref(`ruleset:${slug}`),
      faction_id: ref('faction:house-atreides'),
      position: 0,
    });
  }
  for (const listed of COVERED_FACTIONS) {
    const row = faction({ name: listed.name });
    baseline.factions.push(row);
    for (const [position, slug] of listed.rulesets.entries()) {
      baseline.ruleset_factions.push({ ruleset_id: ref(`ruleset:${slug}`), faction_id: ref(row.$key!), position });
    }
  }
});

/** The variants beside the Original, in the order they were made, each with its parent and the rulesets it is in. */
const SWITCHER_VARIANTS = [
  { name: 'Dreamrules', parent: 'house-atreides', rulesets: ['dreamrules'] },
  {
    name: 'Tournament',
    parent: 'house-atreides-dreamrules',
    rulesets: ['dreamrules', 'spring-cup', 'sietch-house-rules'],
  },
  { name: 'Two players', parent: 'house-atreides', rulesets: [] },
] as const;

/**
 * House Atreides with four variants, for the variant switcher (#2928).
 * Dreamrules follows the Original and Tournament follows Dreamrules;
 * Two players follows the Original.
 * The Original is in two rulesets, Dreamrules in one, Tournament in three and Two players in none, and one ruleset has no cover, as most start out.
 */
export const withFourVariants = db((baseline) => {
  const original = baseline.factions[0]!;
  /* Battle strengths on every troop, so no variant's page is headed by a problem that has nothing to do with the switcher. */
  original.data.troops = original.data.troops.map((troop: FactionInput['troops'][number]) => ({
    ...troop,
    capable: true,
    combat: { strength: 1, supportedStrength: 2 },
  }));
  baseline.rulesets[0]!.image_cover = drawnCover('#27445c', '#c98a3c');
  baseline.rulesets.push(
    { ...ruleset({ name: 'Dreamrules' }), image_cover: drawnCover('#4a2d5e', '#d9a15a') },
    { ...ruleset({ name: 'Spring Cup' }), image_cover: drawnCover('#2f5a3f', '#e0c06a') },
    ruleset({ name: 'Sietch house rules' })
  );
  baseline.ruleset_factions.push({
    ruleset_id: ref('ruleset:sietch-house-rules'),
    faction_id: ref('faction:house-atreides'),
    position: 0,
  });
  for (const variant of SWITCHER_VARIANTS) {
    const variantSlug = variant.name.toLowerCase().replaceAll(' ', '-');
    const key = `faction:house-atreides-${variantSlug}`;
    baseline.factions.push({
      ...original,
      $key: key,
      $patch: undefined,
      slug: `house-atreides-${variantSlug}`,
      data: structuredClone(original.data),
      variant_name: variant.name,
      variant_slug: variantSlug,
      parent_id: ref(`faction:${variant.parent}`),
      inherited: [...INHERITABLE_FIELDS],
      revision: 0,
    });
    for (const [position, slug] of variant.rulesets.entries()) {
      baseline.ruleset_factions.push({ ruleset_id: ref(`ruleset:${slug}`), faction_id: ref(key), position });
    }
  }
});

/** The Variants card once the variant page has loaded. */
export async function findVariantsCard(canvasElement: HTMLElement) {
  const page = within(canvasElement.ownerDocument.body);
  return await page.findByRole('region', { name: 'Variants' }, { timeout: 30_000 });
}

/** The switcher's rows as its reader meets them: four variants with the default first, the one being read marked, and no name cut short. */
export async function expectVariantSwitcher(canvasElement: HTMLElement, current: string) {
  const card = within(await findVariantsCard(canvasElement));
  const rows = card.getAllByRole('listitem');
  await expect(rows.map((row) => within(row).getByRole('paragraph').textContent)).toEqual([
    'Original',
    'Dreamrules',
    'Tournament',
    'Two players',
  ]);
  /* Each row leads to its variant's own address; the Original took one when the Faction gained a second variant. */
  await expect(rows.map((row) => within(row).getByRole('link').getAttribute('href'))).toEqual([
    '/factions/house-atreides-original',
    '/factions/house-atreides-dreamrules',
    '/factions/house-atreides-tournament',
    '/factions/house-atreides-two-players',
  ]);
  for (const row of rows) {
    const label = within(row).getByRole('paragraph');
    const marked = within(row).getByRole('link').getAttribute('aria-current') === 'page';
    await expect(marked).toBe(label.textContent === current);
    await expect(label.scrollWidth).toBeLessThanOrEqual(label.clientWidth);
    await expect(label.getBoundingClientRect().height).toBeLessThan(
      2 * Number.parseFloat(getComputedStyle(label).lineHeight)
    );
  }
  /* Tournament is in three rulesets, one of them without a cover; Two players is in none. */
  await expect(card.getByRole('group', { name: 'Rulesets: Dreamrules, Spring Cup, Sietch house rules' })).toBeVisible();
  await expect(within(rows[3]!).queryByRole('group')).toBeNull();
}

/** The Faction settings popover, opened from the variant page's toolbar once the viewer is known to maintain the Faction. */
export async function openFactionSettings(canvasElement: HTMLElement) {
  const page = within(canvasElement.ownerDocument.body);
  await userEvent.click(await page.findByRole('button', { name: 'Faction settings' }, { timeout: 30_000 }));
  const settings = await page.findByRole('dialog', undefined, { timeout: 30_000 });
  await waitFor(() => expect(settings).toBeVisible());
  return settings;
}

/** The variants in the Faction settings, in the order shown, each with whether its row carries the hold that evicts it. */
export function settingsRows(settings: HTMLElement) {
  return within(settings)
    .getAllByRole('listitem')
    .map((row) => {
      const name = within(row).getAllByRole('paragraph')[0]!;
      return {
        name: name.textContent,
        evicts: within(row).queryByRole('button', { name: `Evict ${name.textContent}` }) !== null,
        /* The name is whole: nothing of it is hidden past its own box. */
        whole: name.scrollWidth <= name.clientWidth,
      };
    });
}

/** The settings as the Faction's maintainers first meet them: the default first with no eviction on its row, and the Faction closed. */
export async function expectFactionSettings(settings: HTMLElement) {
  await expect(settingsRows(settings)).toEqual([
    { name: 'Original', evicts: false, whole: true },
    { name: 'Dreamrules', evicts: true, whole: true },
    { name: 'Tournament', evicts: true, whole: true },
    { name: 'Two players', evicts: true, whole: true },
  ]);
  await expect(
    within(settings).getByRole('checkbox', { name: 'Anyone signed in may add a variant' })
  ).not.toBeChecked();
  /* The Faction goes with its last variant, so the settings explain that and carry no Delete of their own. */
  await expect(within(settings).getByRole('button', { name: 'Deleting the faction' })).toHaveAttribute(
    'aria-expanded',
    'false'
  );
  await expect(within(settings).queryByRole('button', { name: /^Delete/ })).toBeNull();
}
