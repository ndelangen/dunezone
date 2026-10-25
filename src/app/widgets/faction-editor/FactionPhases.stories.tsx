import preview from '@sb/preview';
import { expect, userEvent, within } from 'storybook/test';

import {
  validPhase,
  factionWith,
  FactionPhasesFixture,
  sequenceRows,
  openPhases,
} from './FactionPhases.stories.fixture';

/* The storm-order notes a reader sees, as their texts: the sequence shows one note per placed group, or one note for the whole sequence when its column is narrow. */
function visibleStormNotes(canvasElement: HTMLElement) {
  const sequence = within(within(canvasElement).getByRole('region', { name: 'Phase sequence' }));
  return sequence
    .queryAllByText(/storm order/)
    .filter((note) => note.checkVisibility())
    .map((note) => note.textContent);
}

/* On a phone the section tabs fold into a picker, so the chapter is chosen there. */
async function openPhasesFromPicker(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  await userEvent.click(canvas.getByRole('combobox', { name: 'Faction editor sections' }));
  await userEvent.click(await within(canvasElement.ownerDocument.body).findByRole('option', { name: /Phases/ }));
  return canvas;
}

const setupAndTurnPhases = [
  { ...validPhase, id: 'omen', title: 'Desert omen', symbol: '/vector/icon/fate.svg', before: 'forces' },
  validPhase,
];

const meta = preview.meta({
  title: 'Faction Editor/Phases',
  component: FactionPhasesFixture,
  args: { faction: factionWith(undefined) },
  globals: { viewport: { value: 'appDesktop' } },
  parameters: { layout: 'fullscreen' },
});

/** A faction saved before phases existed: no field, nothing added, Save free. */
export const Empty = meta.story({
  play: async ({ canvasElement }) => {
    const canvas = await openPhases(canvasElement);
    await expect(canvas.getByText('No faction phases')).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Save faction' })).not.toHaveAttribute('aria-disabled');
    await expect(
      canvas.getByText('This faction adds no phases, so the game runs the standard setup and turn.')
    ).toBeVisible();
    await expect(sequenceRows(canvasElement, 'Setup')).toEqual(['Traitors', 'Starting troops']);
    await expect(sequenceRows(canvasElement, 'Each turn')).toHaveLength(9);
  },
});

/** One phase in setup and one every turn: each sits before its target, with the storm-order hint for other factions' ties. */
export const SequenceSetupAndTurn = meta.story({
  args: { faction: factionWith(setupAndTurnPhases) },
  play: async ({ canvasElement }) => {
    await openPhases(canvasElement);
    const tie = "Another faction's phase here at the same priority goes in storm order.";
    await expect(sequenceRows(canvasElement, 'Setup')).toEqual(['Traitors', 'Desert omen', 'Starting troops']);
    await expect(sequenceRows(canvasElement, 'Each turn').slice(2, 5)).toEqual([
      'CHOAM Charity',
      'Guild negotiations',
      'Bidding',
    ]);
    /* The hint shows under each placed group but is a note, not a counted step. */
    await expect(visibleStormNotes(canvasElement)).toEqual([tie, tie]);
    /* The shelf's selected phase is the one marked in the sequence. */
    const sequence = within(within(canvasElement).getByRole('region', { name: 'Phase sequence' }));
    const setup = within(sequence.getByRole('list', { name: 'Setup' }));
    await expect(setup.getByText('Desert omen').closest('li')).toHaveAttribute('aria-current', 'true');
    await expect(setup.getByText('Traitors').closest('li')).not.toHaveAttribute('aria-current');
  },
});

/** On a phone the sequence sits in the 7rem preview thumbnail: every label wraps whole instead of truncating, and one storm-order note ends the sequence in place of one per group. */
export const SequenceOnPhone = meta.story({
  args: { faction: factionWith(setupAndTurnPhases) },
  globals: { viewport: { value: 'appMobile' } },
  play: async ({ canvasElement }) => {
    await openPhasesFromPicker(canvasElement);
    const sequence = await within(canvasElement).findByRole('region', { name: 'Phase sequence' });
    const paper = sequence.getBoundingClientRect();
    /* The labels a reader cannot read whole: cut short across by an ellipsis or down by a line clamp, or running past the sequence's paper. */
    const clipped = within(sequence)
      .getAllByRole('listitem')
      .map((item) => within(item).getByText(item.textContent ?? ''))
      .filter(
        (label) =>
          label.scrollWidth > label.clientWidth ||
          label.scrollHeight > label.clientHeight ||
          label.getBoundingClientRect().right > paper.right
      )
      .map((label) => label.textContent);
    await expect(clipped).toEqual([]);
    await expect(visibleStormNotes(canvasElement)).toEqual(['Ties with other factions go in storm order.']);
  },
});

/** A refused row stays out of the sequence, which names it, while the valid rows keep their places. */
export const SequenceLeavesOutInvalidRow = meta.story({
  args: { faction: factionWith([validPhase, { ...validPhase, id: 'broken', title: 'Broken omen', before: 'karama' }]) },
  play: async ({ canvasElement }) => {
    const canvas = await openPhases(canvasElement);
    await expect(canvas.getByText('Left out until fixed: Broken omen.')).toBeVisible();
    await expect(sequenceRows(canvasElement, 'Each turn')).toContain('Guild negotiations');
    await expect(sequenceRows(canvasElement, 'Each turn')).not.toContain('Broken omen');
  },
});

export const UnknownPlacement = meta.story({
  args: { faction: factionWith([{ ...validPhase, before: 'karama' }]) },
  play: async ({ canvasElement }) => {
    const canvas = await openPhases(canvasElement);
    await expect(canvas.getByText('Karama is not a phase you can place before.')).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Save faction' })).toHaveAttribute('aria-disabled', 'true');
  },
});
