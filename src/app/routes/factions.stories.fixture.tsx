import { waitForFrame } from '@sb/storyWaits';
import { createMemoryHistory } from '@tanstack/react-router';
import type { RouterHistory } from '@tanstack/react-router';
import { expect, within } from 'storybook/test';

import { db, faction, ref, refText, SEED_REF_TOKEN } from '@db/storybook';
import type { StorybookDatabase } from '@db/storybook';

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
