import { Anchor, Stack, Text, Title } from '@mantine/core';
import type { RouteNoticeCode } from '@shared/routeNotices';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { factionAuthoringStatusMessage } from '@ui/content/assetPublishingStatus';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';
import { useRef, useState } from 'react';

import { useCreateFaction } from '@db/factions';
import { useCurrentProfile } from '@db/profiles';
import { AuthoringToolbar } from '@app/widgets/authoring/AuthoringToolbar';
import { useValidationHeaderOpen } from '@app/widgets/authoring/useValidationHeaderOpen';
import { ValidationHeader } from '@app/widgets/authoring/ValidationHeader';
import { defaultFaction } from '@app/widgets/faction-editor/defaultFaction';
import { FactionComplexityIndicator } from '@app/widgets/faction-editor/FactionComplexityIndicator';
import { FactionEditor } from '@app/widgets/faction-editor/FactionEditor';
import type { FactionAuthoringViewHandle } from '@app/widgets/faction-editor/FactionEditor';
import { FactionLoadPopover } from '@app/widgets/faction-editor/FactionLoadPopover';
import { useFactionAuthoring } from '@app/widgets/faction-editor/useFactionAuthoring';

const VALIDATION_HEADER_ID = 'faction-validation-header';

export const Route = createFileRoute('/_app/factions/create')({
  component: CreateFactionPage,
});

function CreateFactionPage() {
  const profile = useCurrentProfile();
  const ownerUserId = profile.data?.user_id;
  const navigate = useNavigate();
  const createFaction = useCreateFaction();
  const viewRef = useRef<FactionAuthoringViewHandle | null>(null);
  const routeNoticeRef = useRef<RouteNoticeCode | null>(null);
  const authoring = useFactionAuthoring({
    sessionKey: 'create',
    initialData: defaultFaction,
    persistence: {
      save: async (draft) => {
        const entry = await createFaction.mutateAsync({ input: draft });
        routeNoticeRef.current = entry.route_notice;
        return entry;
      },
      isPending: createFaction.isPending,
      error: createFaction.error,
      hasSaved: createFaction.data !== undefined,
      reset: createFaction.reset,
    },
    onSaved: (entry) => {
      navigate({
        to: '/factions/$factionId/edit',
        params: { factionId: entry.slug },
        search: routeNoticeRef.current ? { notice: routeNoticeRef.current } : {},
      });
    },
  });
  const [settleTick, setSettleTick] = useState(0);
  const validationHeaderOpen = useValidationHeaderOpen(authoring.editing.warnings.length, settleTick);

  const header = (
    <Stack align="center" gap={4}>
      <Anchor size="sm" renderRoot={(rootProps) => <Link {...rootProps} to="/factions" />}>
        Factions
      </Anchor>
      <Title order={1}>Create faction</Title>
      <Text c="dimmed">Build one faction document, then save it to schedule publication.</Text>
    </Stack>
  );

  if (!ownerUserId) {
    return (
      <PageLayout>
        <PageLayout.Header size="compact">{header}</PageLayout.Header>
        <PageLayout.Content>
          <Surface padding="xl">
            <Stack gap="sm">
              <Text>
                <Anchor renderRoot={(rootProps) => <Link {...rootProps} to="/auth/login" />}>Log in</Anchor> to create a
                faction.
              </Text>
              <Anchor renderRoot={(rootProps) => <Link {...rootProps} to="/factions" />}>Back to factions</Anchor>
            </Stack>
          </Surface>
        </PageLayout.Content>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <PageLayout.Header size="compact">
        {validationHeaderOpen ? (
          <ValidationHeader
            id={VALIDATION_HEADER_ID}
            warnings={authoring.editing.warnings}
            onFocusWarning={(warning) => viewRef.current?.focusWarning(warning)}
          />
        ) : (
          header
        )}
      </PageLayout.Header>
      <PageLayout.Toolbar>
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
            onBack: () => navigate({ to: '/factions' }),
          }}
          review={{ label: 'Review faction sheet', onOpen: (trigger) => viewRef.current?.openReview(trigger) }}
          centerIndicator={<FactionComplexityIndicator form={authoring.form} />}
          auxiliaryActions={
            <FactionLoadPopover disabled={createFaction.isPending} onLoaded={authoring.actions.loadDraft} />
          }
          context={
            <Text size="xs" c="dimmed">
              Group assignment becomes available after the first save.
            </Text>
          }
        />
      </PageLayout.Toolbar>
      <PageLayout.Content>
        <FactionEditor
          key="create"
          ref={viewRef}
          form={authoring.form}
          errors={authoring.persistence.errors}
          isNameBlank={authoring.editing.isNameBlank}
          warnings={authoring.editing.warnings}
          onSettle={() => setSettleTick((tick) => tick + 1)}
        />
      </PageLayout.Content>
    </PageLayout>
  );
}
