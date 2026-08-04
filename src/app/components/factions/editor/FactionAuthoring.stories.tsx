import { Box, Stack } from '@mantine/core';
import preview from '@sb/preview';
import { useRef } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { factionEntry, representativeFaction } from './FactionAuthoringStoryFixtures';
import { FactionAuthoringToolbar } from './FactionAuthoringToolbar';
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
          isDirty={authoring.editing.isDirty}
          isNameBlank={authoring.editing.isNameBlank}
          warningCount={authoring.editing.warnings.length}
          saveState={authoring.persistence.saveState}
          onSave={authoring.actions.submit}
          onReviewWarnings={() => viewRef.current?.focusFirstWarning()}
          onReview={(trigger) => viewRef.current?.openReview(trigger)}
          onReset={authoring.actions.reset}
          onBack={() => undefined}
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

export const WideContract = meta.story({
  globals: {
    viewport: {
      value: 'appAuthoringWide',
    },
  },
});

export const CompactContract = meta.story({
  globals: {
    viewport: {
      value: 'appAuthoringCompact',
    },
  },
});

export const TabletContract = meta.story({
  globals: {
    viewport: {
      value: 'appAuthoringTablet',
    },
  },
});

export const FactionTokenProofGeometry = meta.story({
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const tokenChoice = canvas.getByRole('radio', { name: 'Faction token' });
    const backgroundChoice = canvas.getByRole('radio', { name: 'Background' });

    const expectSquareTokenProof = async () => {
      await waitFor(() => {
        const tokenProof = canvasElement.querySelector<HTMLElement>('[data-faction-token-proof]');
        const renderedToken = tokenProof?.firstElementChild as HTMLElement | null;
        expect(tokenProof).not.toBeNull();
        expect(renderedToken).not.toBeNull();

        const bounds = renderedToken?.getBoundingClientRect();
        expect(bounds?.width).toBeGreaterThan(0);
        expect(bounds?.height).toBeGreaterThan(0);
        expect(Math.abs((bounds?.width ?? 0) - (bounds?.height ?? 0))).toBeLessThanOrEqual(1);
      });
    };

    await userEvent.click(tokenChoice);
    await expectSquareTokenProof();

    await userEvent.click(backgroundChoice);
    await userEvent.click(tokenChoice);
    await expectSquareTokenProof();
  },
});

export const PreviewFreeMobile = meta.story({
  name: 'Mobile authoring',
  globals: {
    viewport: {
      value: 'appMobile',
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const picker = canvas.getByRole('combobox', { name: 'Faction editor sections' });

    await expect(picker).toHaveTextContent('Identity & Appearance');
    await expect(
      canvas.getByRole('region', { name: 'Background composite live preview' })
    ).toBeVisible();

    await userEvent.click(canvas.getByRole('button', { name: 'Next section' }));
    await expect(picker).toHaveTextContent('Faction leader');
    await expect(canvas.getByRole('textbox', { name: 'Faction leader name' })).toBeVisible();
    await expect(
      canvas.getByRole('region', { name: 'Faction leader token live preview' })
    ).toBeVisible();
  },
});
