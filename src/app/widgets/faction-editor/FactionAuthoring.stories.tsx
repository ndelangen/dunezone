import { Box, Stack } from '@mantine/core';
import preview from '@sb/preview';
import { useRef } from 'react';

import { factionEntry, representativeFaction } from './FactionAuthoringStoryFixtures';
import { FactionAuthoringToolbar } from './FactionAuthoringToolbar';
/* PROTOTYPE (wayfinder #404) — remove with FactionComplexityPrototype.tsx */
import { PrototypeComplexityToolbarIndicator } from './FactionComplexityPrototype';
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
        <FactionAuthoringToolbar
          status={{
            isDirty: authoring.editing.isDirty,
            isNameBlank: authoring.editing.isNameBlank,
            warningCount: authoring.editing.warnings.length,
            saveState: authoring.persistence.saveState,
          }}
          actions={{
            onSave: authoring.actions.submit,
            onReviewWarnings: () => viewRef.current?.focusFirstWarning(),
            onReview: (trigger) => viewRef.current?.openReview(trigger),
            onReset: authoring.actions.reset,
            onBack: () => undefined,
          }}
          centerIndicator={
            /* PROTOTYPE (wayfinder #404) */
            <PrototypeComplexityToolbarIndicator form={authoring.form} />
          }
        />
        <FactionEditor
          ref={viewRef}
          form={authoring.form}
          errors={authoring.persistence.errors}
          isNameBlank={authoring.editing.isNameBlank}
          warnings={authoring.editing.warnings}
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
