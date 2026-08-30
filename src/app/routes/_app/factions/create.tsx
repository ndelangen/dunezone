import { Anchor, Stack, Text } from '@mantine/core';
import type { RouteNoticeCode } from '@shared/routeNotices';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { LoginGate } from '@ui/block/LoginGate';
import { PageTitle } from '@ui/block/PageTitle';
import { factionAuthoringStatusMessage } from '@ui/content/assetPublishingStatus';
import { PageLayout } from '@ui/layout/PageLayout';
import { useRef } from 'react';

import { useCreateFaction } from '@db/factions';
import { useCurrentProfile } from '@db/profiles';
import { AuthoringToolbar } from '@app/widgets/authoring/AuthoringToolbar';
import { useValidationHeader } from '@app/widgets/authoring/useValidationHeader';
import { ValidationHeader } from '@app/widgets/authoring/ValidationHeader';
import { defaultFaction } from '@app/widgets/faction-editor/defaultFaction';
import { FactionComplexityIndicator } from '@app/widgets/faction-editor/FactionComplexityIndicator';
import { FactionEditor } from '@app/widgets/faction-editor/FactionEditor';
import type { FactionAuthoringViewHandle } from '@app/widgets/faction-editor/FactionEditor';
import { FactionLoadPopover } from '@app/widgets/faction-editor/FactionLoadPopover';
import { useFactionAuthoring } from '@app/widgets/faction-editor/useFactionAuthoring';
import { PageMessage } from '@app/widgets/page-message/PageMessage';

import { useFactionNameField } from './-factionNameField';

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
  const { nameField, conflictWarnings } = useFactionNameField();
  const allWarnings = [...authoring.editing.warnings, ...conflictWarnings];
  const validationHeader = useValidationHeader(allWarnings.length);

  const header = (
    <Stack align="center" gap={4}>
      <Anchor size="sm" renderRoot={(rootProps) => <Link {...rootProps} to="/factions" />}>
        Factions
      </Anchor>
      <PageTitle title="Create faction" />
      <Text c="dimmed">Build one faction document, then save it to schedule publication.</Text>
    </Stack>
  );

  if (!ownerUserId) {
    return (
      <PageMessage
        size="compact"
        title="Create faction"
        back={<PageMessage.Back to="/factions">Back to factions</PageMessage.Back>}
      >
        <LoginGate action="create a faction" />
      </PageMessage>
    );
  }

  return (
    <PageLayout>
      <PageLayout.Header size="compact">
        {/*
         * The band is occupied either way here, by the strip or by the page's own masthead, so this
         * is the one editor whose header slot never changes height.
         * The open latch exists to stop that height changing mid-keystroke, which means it has
         * nothing to protect on this page, and holding it open past the last warning would trade a
         * jump the page cannot make for a masthead replaced by an empty strip.
         * So the strip answers for its own contents too: no warnings, no strip.
         */}
        {validationHeader.open && allWarnings.length > 0 ? (
          <ValidationHeader
            id={VALIDATION_HEADER_ID}
            warnings={allWarnings}
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
            onReset: validationHeader.releasing(authoring.actions.reset),
            onBack: () => navigate({ to: '/factions' }),
          }}
          review={{ label: 'Review faction sheet', onOpen: (trigger) => viewRef.current?.openReview(trigger) }}
          centerIndicator={<FactionComplexityIndicator form={authoring.form} />}
          auxiliaryActions={
            <FactionLoadPopover
              disabled={createFaction.isPending}
              onLoaded={validationHeader.releasing(authoring.actions.loadDraft)}
            />
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
          nameField={nameField}
          key="create"
          ref={viewRef}
          form={authoring.form}
          errors={authoring.persistence.errors}
          isNameBlank={authoring.editing.isNameBlank}
          warnings={allWarnings}
          onSettle={validationHeader.settle}
          backgroundModeMemory={authoring.backgroundModeMemory}
          onBackgroundModeMemoryChange={authoring.setBackgroundModeMemory}
        />
      </PageLayout.Content>
    </PageLayout>
  );
}
