import { userEvent, within } from 'storybook/test';

import type { Faction } from '@db/factions';

import { representativeFaction } from './FactionAuthoringStoryFixtures';
import { FactionEditorHarness } from './FactionEditorHarness.stories.fixture';

export type Phase = NonNullable<Faction['extraPhases']>[number];

export const validPhase: Phase = {
  id: 'story-phase-bidding',
  type: 'instruction',
  title: 'Guild negotiations',
  symbol: '/vector/icon/bidding_standalone.svg',
  before: 'bidding',
  priority: 10,
  allPlayersMustBeReady: false,
  instructions: 'Agree any shipment deals before bidding opens.',
};

export function factionWith(phases: unknown[] | undefined): Faction {
  const faction = representativeFaction();
  if (phases) {
    faction.extraPhases = phases as Phase[];
  }
  return faction;
}

/* The toolbar sits above the editor so a story shows Save held by a refused row. */
export function FactionPhasesFixture({ faction }: { faction: Faction }) {
  return <FactionEditorHarness faction={faction} sessionKey="storybook-faction-phases" />;
}

/* The read-only rundown beside the list, as a list of its row texts per section. */
export function sequenceRows(canvasElement: HTMLElement, section: 'Setup' | 'Each turn') {
  const sequence = within(within(canvasElement).getByRole('region', { name: 'Phase sequence' }));
  return within(sequence.getByRole('list', { name: section }))
    .getAllByRole('listitem')
    .map((item) => item.textContent);
}

export async function openPhases(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  await userEvent.click(canvas.getByRole('tab', { name: /Phases/ }));
  return canvas;
}
