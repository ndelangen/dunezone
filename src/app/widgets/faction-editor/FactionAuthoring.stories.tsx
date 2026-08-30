import { Box, Stack } from '@mantine/core';
import preview from '@sb/preview';
import { factionAuthoringStatusMessage } from '@ui/content/assetPublishingStatus';
import { useRef } from 'react';

import { AuthoringToolbar } from '@app/widgets/authoring/AuthoringToolbar';

import { factionEntry, representativeFaction } from './FactionAuthoringStoryFixtures';
import { FactionComplexityIndicator } from './FactionComplexityIndicator';
import { FactionEditor } from './FactionEditor';
import type { FactionAuthoringViewHandle } from './FactionEditor';
import { useFactionAuthoring } from './useFactionAuthoring';

function FactionAuthoringFixture() {
  const viewRef = useRef<FactionAuthoringViewHandle>(null);
  const entry = factionEntry(representativeFaction());
  const authoring = useFactionAuthoring({
    sessionKey: entry._id,
    initialData: entry.data,
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
      <Stack gap="clamp(var(--mantine-spacing-sm), 3vw, var(--mantine-spacing-xl))">
        <AuthoringToolbar
          status={{
            isDirty: authoring.editing.isDirty,
            isNameBlank: authoring.editing.isNameBlank,
            saveState: authoring.persistence.saveState,
          }}
          copy={{
            saveLabel: 'Save faction',
            nameBlankMessage: 'Add a faction name before saving; it determines the faction URL.',
            statusMessage: factionAuthoringStatusMessage(authoring.persistence.saveState),
          }}
          actions={{
            onSave: authoring.actions.submit,
            onReset: authoring.actions.reset,
            onBack: () => undefined,
          }}
          review={{ label: 'Review faction sheet', onOpen: (trigger) => viewRef.current?.openReview(trigger) }}
          centerIndicator={<FactionComplexityIndicator form={authoring.form} />}
        />
        <FactionEditor
          ref={viewRef}
          form={authoring.form}
          errors={authoring.persistence.errors}
          isNameBlank={authoring.editing.isNameBlank}
          warnings={authoring.editing.warnings}
          backgroundModeMemory={authoring.backgroundModeMemory}
          onBackgroundModeMemoryChange={authoring.setBackgroundModeMemory}
        />
      </Stack>
    </Box>
  );
}

const meta = preview.meta({
  title: 'Complete Authoring Surface',
  component: FactionAuthoringFixture,
  globals: {
    viewport: {
      value: 'appDesktop',
    },
  },
  parameters: {
    layout: 'fullscreen',
  },
});

export const Desktop = meta.story({});

export const PreviewFreeMobile = meta.story({
  name: 'Mobile authoring',
  globals: {
    viewport: {
      value: 'appMobile',
    },
  },
});
