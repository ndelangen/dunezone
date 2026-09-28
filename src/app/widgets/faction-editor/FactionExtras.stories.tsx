import preview from '@sb/preview';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';

import type { Faction } from '@db/factions';
import { db } from '@db/storybook';

import { representativeFaction } from './FactionAuthoringStoryFixtures';
import { FactionEditorHarness } from './FactionEditorHarness.stories.fixture';

/* The story database's baseline catalogue holds a deck, a bundle and single tokens, so the picker lists real rows. */
const saved = fn();

function factionWith(extras: Faction['extras']): Faction {
  const faction = representativeFaction();
  if (extras) {
    faction.extras = extras;
  }
  return faction;
}

function FactionExtrasFixture({ faction }: { faction: Faction }) {
  return <FactionEditorHarness faction={faction} sessionKey="storybook-faction-extras" onSave={saved} />;
}

async function openExtras(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  await userEvent.click(await canvas.findByRole('tab', { name: /Extras/ }, { timeout: 30_000 }));
  return canvas;
}

/* The slugs the chapter lists, in order. */
function listedSlugs(canvasElement: HTMLElement) {
  const list = within(canvasElement).queryByRole('list', { name: 'Extras' });
  return list
    ? within(list)
        .getAllByRole('listitem')
        .map((item) => item.querySelector('p')?.textContent)
    : [];
}

const meta = preview.meta({
  title: 'Faction Editor/Extras',
  component: FactionExtrasFixture,
  args: { faction: factionWith(undefined) },
  globals: { viewport: { value: 'appDesktop' } },
  parameters: { layout: 'fullscreen', database: db((baseline) => baseline) },
  beforeEach: () => {
    saved.mockClear();
  },
});

/** A faction saved before Extras existed: no field, nothing added, Save free. */
export const Empty = meta.story({
  play: async ({ canvasElement }) => {
    const canvas = await openExtras(canvasElement);
    await expect(canvas.getByText('No Extras. The faction brings only its own components.')).toBeVisible();
    await expect(canvas.getByText("Nothing beyond the faction's own components.")).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Save faction' })).toBeEnabled();
  },
});

/** Listed Extras show their catalogue address and kind, beside the setup proof. */
export const Listed = meta.story({
  args: {
    faction: factionWith([
      { type: 'deck', slug: 'house-treachery' },
      { type: 'token-disc', slug: 'karama' },
    ]),
  },
  play: async ({ canvasElement }) => {
    const canvas = await openExtras(canvasElement);
    await expect(listedSlugs(canvasElement)).toEqual(['house-treachery', 'karama']);
    const proof = within(canvas.getByRole('region', { name: 'Starting Extras' }));
    await expect(proof.getByText('Decks')).toBeVisible();
    await expect(proof.getByText('Disc tokens')).toBeVisible();
  },
});

/** Adding from the picker appends the reference and offers each asset once; the save carries only type and slug. */
export const AddFromCatalogue = meta.story({
  args: { faction: factionWith([{ type: 'deck', slug: 'house-treachery' }]) },
  play: async ({ canvasElement }) => {
    const canvas = await openExtras(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Add Extra' }));
    const body = within(canvasElement.ownerDocument.body);
    /* The picker fades in, so its option is in the document a moment before it is visible. */
    await waitFor(() => expect(body.getByRole('option', { name: /Atreides Tokens/ })).toBeVisible(), {
      timeout: 30_000,
    });
    await expect(body.queryByRole('option', { name: /House Treachery/ })).toBeNull();
    await userEvent.click(body.getByRole('option', { name: /Atreides Tokens/ }));
    await waitFor(() => expect(listedSlugs(canvasElement)).toEqual(['house-treachery', 'atreides-tokens']));
    await userEvent.click(canvas.getByRole('button', { name: 'Save faction' }));
    await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
    await expect((saved.mock.calls[0]![0] as Faction).extras).toEqual([
      { type: 'deck', slug: 'house-treachery' },
      { type: 'bundle', slug: 'atreides-tokens' },
    ]);
  },
});

/** Removing a row drops it from the list and the proof. */
export const Remove = meta.story({
  args: {
    faction: factionWith([
      { type: 'deck', slug: 'house-treachery' },
      { type: 'bundle', slug: 'atreides-tokens' },
    ]),
  },
  play: async ({ canvasElement }) => {
    const canvas = await openExtras(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Remove house-treachery' }));
    await expect(listedSlugs(canvasElement)).toEqual(['atreides-tokens']);
    const proof = within(canvas.getByRole('region', { name: 'Starting Extras' }));
    await expect(proof.queryByText('house-treachery')).toBeNull();
  },
});
