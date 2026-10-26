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

/* The names the chapter lists, in order: each row's first line, its address until the catalogue answers. */
export function listedNames(canvasElement: HTMLElement) {
  const list = within(canvasElement).queryByRole('list', { name: 'Extras' });
  return list
    ? within(list)
        .getAllByRole('listitem')
        .map((item) => item.querySelector('p')?.textContent)
    : [];
}

/* Opens the add popover on one type and picks the named asset. */
export async function addExtra(canvasElement: HTMLElement, type: string, name: RegExp) {
  const canvas = within(canvasElement);
  await userEvent.click(canvas.getByRole('button', { name: 'Add Extra' }));
  const body = within(canvasElement.ownerDocument.body);
  await userEvent.selectOptions(await body.findByRole('combobox', { name: 'Type' }), type);
  await userEvent.click(await body.findByRole('option', { name }, { timeout: 30_000 }));
}
