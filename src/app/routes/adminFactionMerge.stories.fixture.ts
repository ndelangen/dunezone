import type { FactionInput } from '@shared/factions/schema';
import { INHERITABLE_FIELDS } from '@shared/factions/variantFields';
import { rulebookNameKey } from '@shared/rulebooks/metadata';
import { slugify } from '@shared/slugify';
import { expect, userEvent, within } from 'storybook/test';

import { db, faction, ref } from '@db/storybook';
import type { StorybookDatabase, StorybookRow } from '@db/storybook';

/*
 * The factions the merge page stories work on.
 * House Atreides is the faction to keep, with four variants of its own, one of them under another.
 * Atreides (advanced) is the same faction authored a second time: equal leaders and troops under their own ids, two rules changed, and three variants, one of them deleted.
 * Atreides copy is a duplicate nobody renamed, so its one variant still has the name every faction starts with.
 */
export const factionMergePath = '/admin/faction-merge';

const NOW = '2026-11-16T00:00:00.000Z';
const KEPT = 'faction:house-atreides';
const DUPLICATE = 'faction:atreides-advanced';

type FactionSeed = StorybookRow<'factions'>;
type FactionData = FactionInput;

function variantOf(
  parent: FactionSeed,
  root: FactionSeed,
  name: string,
  change: Partial<FactionSeed> = {}
): FactionSeed {
  const variantSlug = slugify(name);
  return {
    ...root,
    $key: `${root.$key}-${variantSlug}`,
    $patch: undefined,
    slug: `${root.slug}-${variantSlug}`,
    data: structuredClone(root.data),
    variant_name: name,
    variant_slug: variantSlug,
    parent_id: ref(parent.$key!),
    inherited: [...INHERITABLE_FIELDS],
    revision: 0,
    ...change,
  };
}

/** The same content authored again: every leader and troop under an id of its own. */
function withOwnIds(data: FactionData): FactionData {
  const fresh = (index: number, kind: string) => `30000000-0000-4000-8000-${kind}${String(index).padStart(11, '0')}`;
  return {
    ...structuredClone(data),
    factionLeader: { ...data.factionLeader, memberId: fresh(0, '1') },
    leaders: data.leaders.map((leader, index) => ({ ...leader, memberId: fresh(index + 1, '1') })),
    troops: data.troops.map((troop, index) => ({ ...troop, troopId: fresh(index, '2') })),
  };
}

function withMergeFactions(baseline: StorybookDatabase) {
  const kept = baseline.factions.find((row) => row.$key === KEPT)!;
  const dreamrules = variantOf(kept, kept, 'Dreamrules');
  baseline.factions.push(
    dreamrules,
    variantOf(dreamrules, kept, 'Two-player duel'),
    variantOf(kept, kept, 'Tournament play')
  );

  const copied = withOwnIds(kept.data as FactionData);
  const advanced: FactionSeed = {
    ...faction({ name: 'Atreides (advanced)' }),
    data: {
      ...copied,
      name: 'Atreides (advanced)',
      rules: { ...copied.rules, startText: 'Start with 20 spice.', spiceCount: 20 },
    },
    $key: DUPLICATE,
    /* A faction is made with its first variant under the name every faction starts with; this one was renamed since. */
    $patch: { variant_name: 'Advanced game', variant_slug: 'advanced-game' },
  };
  baseline.factions.push(
    advanced,
    variantOf(advanced, advanced, 'Eight-player table'),
    variantOf(advanced, advanced, 'First draft', { is_deleted: true })
  );
  baseline.factions.push({
    ...faction({ name: 'Atreides copy' }),
    data: { ...withOwnIds(kept.data as FactionData), name: 'Atreides copy' },
  });

  /* A Rulebook whose draft and one Edition name two of the duplicate's leaders, which a merge under a parent rewrites. */
  const contents = {
    blocks: copied.leaders.slice(0, 2).map((leader) => ({ factionId: ref(DUPLICATE), memberId: leader.memberId })),
  };
  baseline.rulebooks.push({
    $key: 'rulebook:advanced-rules',
    ruleset_id: ref('ruleset:classicrules'),
    name: 'Advanced rules',
    name_key: rulebookNameKey('Advanced rules'),
    slug: 'advanced-rules',
    sort_order: 0,
    current_edition_number: 1,
    created_by: ref('storybook-viewer'),
    created_at: NOW,
    updated_at: NOW,
    is_deleted: false,
    deleted_at: null,
  });
  baseline.rulebook_drafts.push({
    rulebook_id: ref('rulebook:advanced-rules'),
    contents,
    revision: 1,
    updated_at: NOW,
    updated_by: ref('storybook-viewer'),
  });
  baseline.rulebook_editions.push({
    $key: 'rulebook-edition:advanced-rules',
    rulebook_id: ref('rulebook:advanced-rules'),
    edition_number: 1,
    created_at: NOW,
    created_by: ref('storybook-viewer'),
  });
  baseline.rulebook_edition_contents.push({ edition_id: ref('rulebook-edition:advanced-rules'), contents });
  return baseline;
}

export const mergeFactions = db(withMergeFactions);

type Page = ReturnType<typeof within>;
const LOAD = { timeout: 30_000 };

/** Opens one side's faction search and picks the row the search names `row`. */
async function pickFaction(page: Page, side: 'keep' | 'merge into it', search: string, row: string) {
  await userEvent.click(await page.findByRole('button', { name: `Choose faction: faction to ${side}` }, LOAD));
  await userEvent.type(await page.findByRole('searchbox', { name: 'Search factions' }), search);
  await userEvent.click(await page.findByRole('button', { name: row }, LOAD));
}

/** The admin keeps House Atreides and chooses the duplicate named `search`; the page then previews the merge. */
export async function chooseMerge(canvasElement: HTMLElement, search: string, row: string) {
  const page = within(canvasElement.ownerDocument.body);
  await pickFaction(page, 'keep', 'House', 'Add House Atreides · Original');
  await pickFaction(page, 'merge into it', search, row);
  await expect(page.findByRole('heading', { name: 'The whole merge' }, LOAD)).resolves.toBeVisible();
  return page;
}

/** The admin keeps House Atreides and chooses one of its own variants to move. */
export async function chooseMove(canvasElement: HTMLElement, variant: string) {
  const page = within(canvasElement.ownerDocument.body);
  await pickFaction(page, 'keep', 'House', 'Add House Atreides · Original');
  await userEvent.click(page.getByRole('checkbox', { name: /Move one of its own variants/ }));
  await userEvent.click(await page.findByRole('combobox', { name: 'Variant to move' }));
  await userEvent.click(await page.findByRole('option', { name: variant }));
  await expect(page.findByRole('heading', { name: 'The whole move' }, LOAD)).resolves.toBeVisible();
  return page;
}

/** Sets the parent one moving variant goes under. */
export async function chooseParent(page: Page, parent: string) {
  await userEvent.click(page.getByRole('combobox', { name: 'Parent variant' }));
  await userEvent.click(await page.findByRole('option', { name: parent }));
}

/** Waits for the preview to settle, then opens the review. */
export async function review(page: Page, action: 'Review merge' | 'Review move') {
  const button = page.getByRole('button', { name: action });
  await expect(button).toBeEnabled();
  await userEvent.click(button);
}
