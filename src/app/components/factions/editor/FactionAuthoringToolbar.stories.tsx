import { Box } from '@mantine/core';
import preview from '@sb/preview';

import type { FactionSaveState } from '@app/factions/authoringState';

import { FactionAuthoringToolbar } from './FactionAuthoringToolbar';

function FactionAuthoringToolbarFixture({
  isDirty,
  isNameBlank,
  warningCount,
  saveState,
}: {
  isDirty: boolean;
  isNameBlank: boolean;
  warningCount: number;
  saveState: FactionSaveState;
}) {
  return (
    <FactionAuthoringToolbar
      isDirty={isDirty}
      isNameBlank={isNameBlank}
      warningCount={warningCount}
      saveState={saveState}
      onSave={() => undefined}
      onReviewWarnings={() => undefined}
      onReview={() => undefined}
      onReset={() => undefined}
      onBack={() => undefined}
    />
  );
}

const meta = preview.meta({
  title: 'Faction Authoring Toolbar',
  component: FactionAuthoringToolbarFixture,
  decorators: [
    (Story) => (
      <Box w="min(78rem, calc(100vw - 2rem))" p="md">
        <Story />
      </Box>
    ),
  ],
  args: {
    isDirty: false,
    isNameBlank: false,
    warningCount: 0,
    saveState: 'idle',
  },
  parameters: {
    layout: 'fullscreen',
  },
});

export const Clean = meta.story({
  args: {
    isDirty: false,
    isNameBlank: false,
    warningCount: 0,
    saveState: 'idle',
  },
});

export const DirtyWithWarnings = meta.story({
  args: {
    isDirty: true,
    isNameBlank: false,
    warningCount: 3,
    saveState: 'idle',
  },
});

export const Saving = meta.story({
  args: {
    isDirty: true,
    isNameBlank: false,
    warningCount: 0,
    saveState: 'saving',
  },
});

export const Saved = meta.story({
  args: {
    isDirty: false,
    isNameBlank: false,
    warningCount: 0,
    saveState: 'saved',
  },
});

export const SaveFailed = meta.story({
  args: {
    isDirty: true,
    isNameBlank: false,
    warningCount: 0,
    saveState: 'error',
  },
});

export const NameRequired = meta.story({
  args: {
    isDirty: true,
    isNameBlank: true,
    warningCount: 0,
    saveState: 'idle',
  },
});
