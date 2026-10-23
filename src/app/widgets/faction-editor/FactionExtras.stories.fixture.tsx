import { fn, userEvent, within } from 'storybook/test';

import type { Faction } from '@db/factions';

import { representativeFaction } from './FactionAuthoringStoryFixtures';
import { FactionEditorHarness } from './FactionEditorHarness.stories.fixture';

/* The story database's baseline catalogue holds a deck, a bundle and single tokens, so the picker lists real rows. */
export const saved = fn();

export function factionWith(extras: Faction['extras']): Faction {
  const faction = representativeFaction();
  if (extras) {
    faction.extras = extras;
  }
  return faction;
}

export function FactionExtrasFixture({ faction }: { faction: Faction }) {
  return <FactionEditorHarness faction={faction} sessionKey="storybook-faction-extras" onSave={saved} />;
}

export async function openExtras(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  await userEvent.click(await canvas.findByRole('tab', { name: /Extras/ }, { timeout: 30_000 }));
  return canvas;
}

/* The slugs the chapter lists, in order. */
export function listedSlugs(canvasElement: HTMLElement) {
  const list = within(canvasElement).queryByRole('list', { name: 'Extras' });
  return list
    ? within(list)
        .getAllByRole('listitem')
        .map((item) => item.querySelector('p')?.textContent)
    : [];
}
