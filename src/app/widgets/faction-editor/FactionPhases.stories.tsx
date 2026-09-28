import { Box, Stack } from '@mantine/core';
import preview from '@sb/preview';
import { expect, userEvent, within } from 'storybook/test';

import type { Faction } from '@db/factions';
import { AuthoringToolbar } from '@app/widgets/authoring/AuthoringToolbar';

import { factionEntry, representativeFaction } from './FactionAuthoringStoryFixtures';
import { FactionEditor } from './FactionEditor';
import { useFactionAuthoring } from './useFactionAuthoring';

type Phase = NonNullable<Faction['extraPhases']>[number];

const validPhase: Phase = {
  id: 'story-phase-bidding',
  type: 'instruction',
  title: 'Guild negotiations',
  symbol: '/vector/icon/bidding_standalone.svg',
  before: 'bidding',
  priority: 10,
  allPlayersMustBeReady: false,
  instructions: 'Agree any shipment deals before the auction opens.',
};

function factionWith(phases: unknown[] | undefined): Faction {
  const faction = representativeFaction();
  if (phases) {
    faction.extraPhases = phases as Phase[];
  }
  return faction;
}

/* The toolbar sits above the editor so a story shows Save held by a refused row. */
function FactionPhasesFixture({ faction }: { faction: Faction }) {
  const authoring = useFactionAuthoring({
    sessionKey: 'storybook-faction-phases',
    initialData: faction,
    persistence: {
      save: async (draft) => factionEntry(draft),
      isPending: false,
      error: null,
      hasSaved: false,
      reset: () => undefined,
    },
    onSaved: () => undefined,
  });

  return (
    <Box w="min(78rem, calc(100vw - 2rem))" p="md">
      <Stack gap="md">
        <AuthoringToolbar
          status={{
            isDirty: authoring.editing.isDirty,
            isNameBlank: authoring.editing.isNameBlank,
            invalid: authoring.editing.invalid,
            saveState: authoring.persistence.saveState,
          }}
          copy={{
            saveLabel: 'Save faction',
            nameBlankMessage: 'Add a faction name before saving; it determines the faction URL.',
          }}
          actions={{ onSave: authoring.actions.submit, onReset: authoring.actions.reset, onBack: () => undefined }}
        />
        <FactionEditor
          form={authoring.form}
          errors={authoring.persistence.errors}
          isNameBlank={authoring.editing.isNameBlank}
          warnings={authoring.editing.warnings}
          backgroundModeMemory={authoring.backgroundModeMemory}
          onBackgroundModeMemoryChange={authoring.setBackgroundModeMemory}
          retainedManualComplexity={authoring.retainedManualComplexity}
          onRetainedManualComplexityChange={authoring.setRetainedManualComplexity}
        />
      </Stack>
    </Box>
  );
}

async function openPhases(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  await userEvent.click(canvas.getByRole('tab', { name: /Phases/ }));
  return canvas;
}

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
    await expect(canvas.getByRole('button', { name: 'Save faction' })).toBeEnabled();
  },
});

export const OneValidRow = meta.story({
  args: { faction: factionWith([validPhase]) },
  play: async ({ canvasElement }) => {
    const canvas = await openPhases(canvasElement);
    await expect(canvas.getByRole('textbox', { name: 'Title' })).toHaveValue('Guild negotiations');
    await expect(canvas.getByText('Before Bidding, priority 10')).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Save faction' })).toBeEnabled();
  },
});

/** Adding a row starts it blank: title, symbol and placement are the author's to choose, and Save waits for them. */
export const NewRowNeedsTheRequiredThree = meta.story({
  play: async ({ canvasElement }) => {
    const canvas = await openPhases(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Add faction phase' }));
    await expect(canvas.getByText('Give the phase a title.')).toBeVisible();
    await expect(canvas.getByText('Choose a symbol.')).toBeVisible();
    await expect(canvas.getByText('Choose where the phase goes.')).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Save faction' })).toBeDisabled();

    await userEvent.type(canvas.getByRole('textbox', { name: 'Title' }), 'Guild negotiations');
    await expect(canvas.queryByText('Give the phase a title.')).toBeNull();
  },
});

export const UnknownPlacement = meta.story({
  args: { faction: factionWith([{ ...validPhase, before: 'karama' }]) },
  play: async ({ canvasElement }) => {
    const canvas = await openPhases(canvasElement);
    await expect(canvas.getByText('Karama is not a phase you can place before.')).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Save faction' })).toBeDisabled();
  },
});

export const UnknownType = meta.story({
  args: { faction: factionWith([{ ...validPhase, type: 'predictoin' }]) },
  play: async ({ canvasElement }) => {
    const canvas = await openPhases(canvasElement);
    await expect(canvas.getByText('"predictoin" is not a phase type.')).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Save faction' })).toBeDisabled();
  },
});

export const MissingSymbol = meta.story({
  args: { faction: factionWith([{ ...validPhase, symbol: undefined }]) },
  play: async ({ canvasElement }) => {
    const canvas = await openPhases(canvasElement);
    await expect(canvas.getByText('Choose a symbol.')).toBeVisible();
  },
});

export const EmptyTitle = meta.story({
  args: { faction: factionWith([{ ...validPhase, title: '' }]) },
  play: async ({ canvasElement }) => {
    const canvas = await openPhases(canvasElement);
    await expect(canvas.getByText('Give the phase a title.')).toBeVisible();
  },
});

export const FractionalPriority = meta.story({
  args: { faction: factionWith([{ ...validPhase, priority: 2.5 }]) },
  play: async ({ canvasElement }) => {
    const canvas = await openPhases(canvasElement);
    await expect(canvas.getByText('Priority must be a whole number.')).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Save faction' })).toBeDisabled();
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
    await expect(canvas.getByRole('button', { name: 'Save faction' })).toBeEnabled();
  },
});
