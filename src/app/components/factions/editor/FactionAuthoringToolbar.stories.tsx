import { Box } from '@mantine/core';
import preview from '@sb/preview';

import { FactionAuthoringToolbar } from './FactionAuthoringToolbar';

const toolbarActions = {
  onSave: () => undefined,
  onReviewWarnings: () => undefined,
  onReview: () => undefined,
  onReset: () => undefined,
  onBack: () => undefined,
};

const cleanToolbar = {
  isDirty: false,
  isNameBlank: false,
  warningCount: 0,
  saveState: 'idle' as const,
  ...toolbarActions,
};

const meta = preview.meta({
  title: 'Faction Authoring Toolbar',
  component: FactionAuthoringToolbar,
  decorators: [
    (Story) => (
      <Box w="min(78rem, calc(100vw - 2rem))" p="md">
        <Story />
      </Box>
    ),
  ],
  args: cleanToolbar,
  parameters: {
    layout: 'fullscreen',
  },
});

export const Clean = meta.story({
  args: cleanToolbar,
});

export const SaveFailed = meta.story({
  args: {
    ...cleanToolbar,
    isDirty: true,
    saveState: 'error',
  },
});

export const PublishedAndCurrent = meta.story({
  args: {
    ...cleanToolbar,
    saveState: 'saved',
    assetPublishing: {
      status: 'current',
      captureStatus: null,
      publicationHref: '/published/factions/storybook-faction/sheet.pdf',
      lastPublishedAt: Date.parse('2026-08-04T18:30:00.000Z'),
    },
  },
});
