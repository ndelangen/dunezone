import { testingPreview } from '@sb/preview';
import { expect, userEvent, within, waitFor } from 'storybook/test';

import {
  validPhase,
  factionWith,
  FactionPhasesFixture,
  sequenceRows,
  openPhases,
} from './FactionPhases.stories.fixture';

const meta = testingPreview.meta({
  title: 'Faction Editor/Phases',
  component: FactionPhasesFixture,
  args: { faction: factionWith(undefined) },
  globals: { viewport: { value: 'appDesktop' } },
  parameters: { layout: 'fullscreen' },
});

/** Adding a row starts it blank: title, symbol and placement are the author's to choose, and Save waits for them. */
export const NewRowNeedsTheRequiredThree = meta.story({
  play: async ({ canvasElement }) => {
    const canvas = await openPhases(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Add faction phase' }));
    await expect(canvas.getByText('Give the phase a title.')).toBeVisible();
    await expect(canvas.getByText('Choose a symbol.')).toBeVisible();
    await expect(canvas.getByText('Choose where the phase goes.')).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Save faction' })).toHaveAttribute('aria-disabled', 'true');

    await userEvent.type(canvas.getByRole('textbox', { name: 'Title' }), 'Guild negotiations');
    await expect(canvas.queryByText('Give the phase a title.')).toBeNull();
  },
});

/** Two prediction rows before the same step at the same priority are allowed; list order decides between them. */
export const Reorder = meta.story({
  args: {
    faction: factionWith([
      { ...validPhase, id: 'first', type: 'prediction', title: 'First prediction', before: 'traitors' },
      { ...validPhase, id: 'second', type: 'prediction', title: 'Second prediction', before: 'traitors' },
    ]),
  },
  play: async ({ canvasElement }) => {
    const canvas = await openPhases(canvasElement);
    const shelf = canvas.getByRole('list', { name: 'Ordered faction phases' });
    await expect(within(shelf).getAllByRole('listitem')[0]).toHaveTextContent('1. First prediction');

    canvas.getByRole('button', { name: 'Drag to reorder First prediction' }).focus();
    await userEvent.keyboard('[Space]');
    await userEvent.keyboard('[ArrowRight]');
    await userEvent.keyboard('[Space]');

    await expect(within(shelf).getAllByRole('listitem')[0]).toHaveTextContent('1. Second prediction');
    await expect(canvas.getByRole('button', { name: 'Save faction' })).not.toHaveAttribute('aria-disabled');
    /* Same step and priority, so list order decides, and the sequence follows the new order before any save. */
    await expect(sequenceRows(canvasElement, 'Setup').slice(0, 2)).toEqual(['Second prediction', 'First prediction']);
  },
});

/** Re-targeting a row moves it in the sequence at once; nothing is saved. */
export const SequenceFollowsPlacement = meta.story({
  args: { faction: factionWith([validPhase]) },
  play: async ({ canvasElement }) => {
    const canvas = await openPhases(canvasElement);
    /* One valid row: its title and summary show, and Save is open. */
    await expect(canvas.getByRole('textbox', { name: 'Title' })).toHaveValue('Guild negotiations');
    await expect(canvas.getByText('Before Bidding, priority 10')).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Save faction' })).not.toHaveAttribute('aria-disabled');
    await expect(sequenceRows(canvasElement, 'Each turn').indexOf('Guild negotiations')).toBe(3);

    await userEvent.click(canvas.getByRole('combobox', { name: 'Placement' }));
    await userEvent.click(await within(document.body).findByRole('option', { name: 'Before Revival' }));

    await waitFor(() => expect(sequenceRows(canvasElement, 'Each turn').indexOf('Guild negotiations')).toBe(4));
    await expect(sequenceRows(canvasElement, 'Each turn')[5]).toBe('Revival');
  },
});

export const UnknownType = meta.story({
  args: { faction: factionWith([{ ...validPhase, type: 'predictoin' }]) },
  play: async ({ canvasElement }) => {
    const canvas = await openPhases(canvasElement);
    await expect(canvas.getByText('"predictoin" is not a phase type.')).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Save faction' })).toHaveAttribute('aria-disabled', 'true');
  },
});

export const FractionalPriority = meta.story({
  args: { faction: factionWith([{ ...validPhase, priority: 2.5 }]) },
  play: async ({ canvasElement }) => {
    const canvas = await openPhases(canvasElement);
    await expect(canvas.getByText('Priority must be a whole number.')).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Save faction' })).toHaveAttribute('aria-disabled', 'true');
  },
});
