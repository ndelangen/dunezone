/*
 * PROTOTYPE, throwaway (#2926, slice 3 of the faction variants plan).
 * Three arrangements of the Faction tab on the variant edit page, each as the faction owner sees it and as a member of the variant's Group sees it.
 * The page is the real edit route over a Faction with one Variant; `factionTabPrototype.tsx` holds the arrangements.
 */
import preview from '@sb/preview';
import { expect, userEvent, within } from 'storybook/test';

import { db, ref } from '@db/storybook';
import { pageStoryMeta } from '@app/routes/storybookConfig';

import { setFactionTabPrototype } from './factionTabPrototype';
import type { FactionTabVariation } from './factionTabPrototype';

const meta = preview.meta({
  title: 'Factions/Prototype faction tab',
  ...pageStoryMeta,
  args: { path: '/factions/house-atreides/edit' },
});

/* The Faction's own Group, which the page query does not carry yet. */
const FACTION_GROUP = 'Landsraad Archivists';

/**
 * The viewer still edits the Variant, as an active member of its Group, but someone else owns the faction.
 * That is the reader the Faction tab is locked for: a Variant's Group grants nothing on the Faction.
 */
const ownedBySomeoneElse = db((baseline) => {
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
  baseline.factions[0]!.owner_id = ref('faction-owner');
});

function arrangement(variation: FactionTabVariation) {
  return () => {
    setFactionTabPrototype({ variation, factionGroup: FACTION_GROUP });
    return () => setFactionTabPrototype(null);
  };
}

async function factionFields(canvasElement: HTMLElement) {
  const page = within(canvasElement.ownerDocument.body);
  return await page.findByRole('group', { name: 'Faction fields' }, { timeout: 30_000 });
}

async function openFactionView(canvasElement: HTMLElement) {
  const page = within(canvasElement.ownerDocument.body);
  await userEvent.click(await page.findByRole('tab', { name: /^Faction: House Atreides/ }, { timeout: 30_000 }));
}

/** A: the rail's first tab is the Faction, under a notice that its fields are shared. */
export const FactionChapter = meta.story({
  beforeEach: arrangement('chapter'),
  play: async ({ canvasElement }) => {
    const fields = await factionFields(canvasElement);
    await expect(fields).toBeEnabled();
    await expect(within(fields).getByRole('textbox', { name: 'Faction name' })).toHaveValue('House Atreides');
  },
});

/** A, locked: the same fields disabled, and the notice names who can change them. */
export const FactionChapterReadOnly = meta.story({
  beforeEach: arrangement('chapter'),
  parameters: { database: ownedBySomeoneElse },
  play: async ({ canvasElement }) => {
    const fields = await factionFields(canvasElement);
    await expect(fields).toBeDisabled();
    await expect(fields.querySelector('#faction-name')).toBeDisabled();
  },
});

/** B: a switch above the editor splits Variant from Faction, and the Faction is one dense pane. */
export const FactionBesideVariant = meta.story({
  beforeEach: arrangement('split'),
  play: async ({ canvasElement }) => {
    await openFactionView(canvasElement);
    await expect(await factionFields(canvasElement)).toBeEnabled();
  },
});

/** B, locked: the Faction side says who maintains it, marks itself view only, and disables its fields. */
export const FactionBesideVariantReadOnly = meta.story({
  beforeEach: arrangement('split'),
  parameters: { database: ownedBySomeoneElse },
  play: async ({ canvasElement }) => {
    await openFactionView(canvasElement);
    await expect(await factionFields(canvasElement)).toBeDisabled();
  },
});

/** C: the Faction tab closes the rail with a Shared mark, and one quiet line in place of a notice. */
export const FactionLastTab = meta.story({
  beforeEach: arrangement('summary'),
  play: async ({ canvasElement }) => {
    await expect(await factionFields(canvasElement)).toBeEnabled();
  },
});

/** C, locked: no controls at all, only the shared values as facts and who maintains them. */
export const FactionLastTabReadOnly = meta.story({
  beforeEach: arrangement('summary'),
  parameters: { database: ownedBySomeoneElse },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByText('Maintained by', {}, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(page.queryByRole('group', { name: 'Faction fields' })).toBeNull();
  },
});
