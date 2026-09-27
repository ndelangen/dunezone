/*
 * PROTOTYPE, #1423. Throwaway, on prototype/1423-toolbar-status-icons, which never merges.
 *
 * The faction edit route with each toolbar variant, on production rows copied into the story database.
 * Pending: House Atreides in the group "dreamers", published, a new capture scheduled, and an unsaved edit to the faction leader's name.
 * Name blank: the same faction with its name cleared, which disables Save.
 * Nothing pending: House Richese, no group, published and current, no edits.
 * Every story also carries the floating switcher, so any of them can flip to the others.
 */
import preview from '@sb/preview';
import { FactionInputSchema } from '@shared/factions/schema';
import { expect, userEvent, within } from 'storybook/test';

import { db, ref, refText, SEED_REF_TOKEN } from '@db/storybook';

import { pageStoryMeta } from './storybookConfig';
import { houseAtreides, houseRichese, PRODUCTION_GROUP_NAME } from './toolbarStatusPrototype.stories.fixture';

const meta = preview.meta({
  title: 'Prototype 1423 toolbar status',
  ...pageStoryMeta,
});

/* The moment the scheduled capture was queued: after the last publication, as a save leaves it. */
const CAPTURE_QUEUED_AT = Date.parse('2026-09-27T09:40:00.000Z');

const pendingDatabase = db((baseline) => {
  const group = baseline.groups[0];
  if (group) {
    group.name = PRODUCTION_GROUP_NAME;
    group.slug = PRODUCTION_GROUP_NAME;
  }
  const atreides = baseline.factions.find((row) => row.$key === 'faction:house-atreides');
  if (!atreides) {
    throw new Error('The baseline has no House Atreides row to replace.');
  }
  atreides.data = FactionInputSchema.parse(houseAtreides.data);
  atreides.created_at = houseAtreides.created_at;
  atreides.updated_at = houseAtreides.updated_at;
  const factionId = refText('faction:house-atreides', SEED_REF_TOKEN);
  baseline.publication_assets.push({
    asset_type: 'faction_sheet',
    asset_id: factionId,
    cache_token: houseAtreides.cache_token,
    published_at: houseAtreides.published_at,
  });
  baseline.publication_jobs.push({
    asset_type: 'faction_sheet',
    asset_id: factionId,
    asset_data: {},
    status: 'pending',
    attempt_counter: 0,
    created_at: CAPTURE_QUEUED_AT,
    updated_at: CAPTURE_QUEUED_AT,
  });
});

const cleanDatabase = db((baseline) => {
  baseline.factions.push({
    $key: 'faction:house-richese',
    owner_id: ref('storybook-viewer'),
    data: FactionInputSchema.parse(houseRichese.data),
    slug: houseRichese.slug,
    created_at: houseRichese.created_at,
    updated_at: houseRichese.updated_at,
    is_deleted: false,
    group_id: null,
  });
  baseline.publication_assets.push({
    asset_type: 'faction_sheet',
    asset_id: refText('faction:house-richese', SEED_REF_TOKEN),
    cache_token: houseRichese.cache_token,
    published_at: houseRichese.published_at,
  });
});

type Page = ReturnType<typeof within>;

async function waitForEditor(page: Page) {
  await expect(page.findByRole('button', { name: 'Back' }, { timeout: 30_000 })).resolves.toBeVisible();
  await page.findByRole('textbox', { name: 'Faction name' }, { timeout: 30_000 });
}

/* An ordinary edit: the faction leader's name, which raises no warning and so leaves the header closed. */
async function editTheLeaderName(page: Page) {
  await waitForEditor(page);
  await userEvent.click(await page.findByRole('tab', { name: 'Faction leader' }, { timeout: 30_000 }));
  const leaderName = await page.findByRole('textbox', { name: 'Faction leader name' }, { timeout: 30_000 });
  await userEvent.clear(leaderName);
  await userEvent.type(leaderName, "Paul Muad'Dib");
}

async function clearTheName(page: Page) {
  await waitForEditor(page);
  await userEvent.clear(await page.findByRole('textbox', { name: 'Faction name' }));
}

const pendingPlay = async ({ canvasElement }: { canvasElement: HTMLElement }) =>
  await editTheLeaderName(within(canvasElement.ownerDocument.body));
const nameBlankPlay = async ({ canvasElement }: { canvasElement: HTMLElement }) =>
  await clearTheName(within(canvasElement.ownerDocument.body));
const cleanPlay = async ({ canvasElement }: { canvasElement: HTMLElement }) =>
  await waitForEditor(within(canvasElement.ownerDocument.body));

const atreides = '/factions/house-atreides/edit';
const richese = '/factions/house-richese/edit';

export const PendingNow = meta.story({
  args: { path: atreides },
  parameters: { database: pendingDatabase },
  play: pendingPlay,
});
export const PendingA = meta.story({
  args: { path: `${atreides}?variant=a` },
  parameters: { database: pendingDatabase },
  play: pendingPlay,
});
export const PendingB = meta.story({
  args: { path: `${atreides}?variant=b` },
  parameters: { database: pendingDatabase },
  play: pendingPlay,
});
export const PendingC = meta.story({
  args: { path: `${atreides}?variant=c` },
  parameters: { database: pendingDatabase },
  play: pendingPlay,
});

export const NameBlankNow = meta.story({
  args: { path: atreides },
  parameters: { database: pendingDatabase },
  play: nameBlankPlay,
});
export const NameBlankA = meta.story({
  args: { path: `${atreides}?variant=a` },
  parameters: { database: pendingDatabase },
  play: nameBlankPlay,
});
export const NameBlankB = meta.story({
  args: { path: `${atreides}?variant=b` },
  parameters: { database: pendingDatabase },
  play: nameBlankPlay,
});
export const NameBlankC = meta.story({
  args: { path: `${atreides}?variant=c` },
  parameters: { database: pendingDatabase },
  play: nameBlankPlay,
});

export const NothingPendingNow = meta.story({
  args: { path: richese },
  parameters: { database: cleanDatabase },
  play: cleanPlay,
});
export const NothingPendingA = meta.story({
  args: { path: `${richese}?variant=a` },
  parameters: { database: cleanDatabase },
  play: cleanPlay,
});
export const NothingPendingB = meta.story({
  args: { path: `${richese}?variant=b` },
  parameters: { database: cleanDatabase },
  play: cleanPlay,
});
export const NothingPendingC = meta.story({
  args: { path: `${richese}?variant=c` },
  parameters: { database: cleanDatabase },
  play: cleanPlay,
});
