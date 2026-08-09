import { Anchor, Paper, Stack, Text, Title } from '@mantine/core';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useRef } from 'react';

import { useCreateFaction } from '@db/factions';
import { useCurrentProfile } from '@db/profiles';
import { FactionAuthoringToolbar } from '@app/components/factions/editor/FactionAuthoringToolbar';
import { FactionEditor } from '@app/components/factions/editor/FactionEditor';
import type { FactionAuthoringViewHandle } from '@app/components/factions/editor/FactionEditor';
import { FactionLoadPopover } from '@app/components/factions/editor/FactionLoadPopover';
import { useFactionAuthoring } from '@app/components/factions/editor/useFactionAuthoring';
import { PageLayout } from '@app/components/shell';
import { defaultFaction } from '@data/defaultFaction';

export const Route = createFileRoute('/_app/factions/create')({
  component: CreateFactionPage,
});

function CreateFactionPage() {
  const profile = useCurrentProfile();
  const ownerUserId = profile.data?.user_id;
  const navigate = useNavigate();
  const createFaction = useCreateFaction();
  const viewRef = useRef<FactionAuthoringViewHandle | null>(null);
  const authoring = useFactionAuthoring({
    sessionKey: 'create',
    initialData: defaultFaction,
    persistence: {
      save: async (draft) => await createFaction.mutateAsync({ input: draft, groupId: null }),
      isPending: createFaction.isPending,
      error: createFaction.error,
      hasSaved: createFaction.data !== undefined,
      reset: createFaction.reset,
    },
    onSaved: (entry) => {
      navigate({
        to: '/factions/$factionId/edit',
        params: { factionId: entry.slug },
      });
    },
  });

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
      <PageLayout header={header} headerSize="compact">
        <Paper withBorder radius="md" p="xl">
          <Stack gap="sm">
            <Text>
              <Anchor renderRoot={(rootProps) => <Link {...rootProps} to="/auth/login" />}>
                Log in
              </Anchor>{' '}
              to create a faction.
            </Text>
            <Anchor renderRoot={(rootProps) => <Link {...rootProps} to="/factions" />}>
              Back to factions
            </Anchor>
          </Stack>
        </Paper>
      </PageLayout>
    );
  }

  return (
    <PageLayout
      header={header}
      headerSize="compact"
      toolbar={
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
            onBack: () => navigate({ to: '/factions' }),
          }}
          auxiliaryActions={
            <FactionLoadPopover
              disabled={createFaction.isPending}
              onLoaded={authoring.actions.loadDraft}
            />
          }
          context={
            <Text size="xs" c="dimmed">
              Group assignment becomes available after the first save.
            </Text>
          }
        />
      }
    >
      <FactionEditor
        key="create"
        ref={viewRef}
        form={authoring.form}
        errors={authoring.persistence.errors}
        isNameBlank={authoring.editing.isNameBlank}
        warnings={authoring.editing.warnings}
      />
    </PageLayout>
  );
}
