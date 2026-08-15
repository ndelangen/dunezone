import { Anchor, Button, Group, Stack, Text, Title } from '@mantine/core';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { IconAction } from '@ui/control/IconAction';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';
import { Trash2, UserRoundMinus } from 'lucide-react';
import { useRef, useState } from 'react';

import { useDeleteFaction, useFaction, useSetFactionGroup, useUpdateFaction } from '@db/factions';
import { loadFaction } from '@db/factions';
import { FactionAuthoringToolbar } from '@app/widgets/faction-editor/FactionAuthoringToolbar';
/* PROTOTYPE (wayfinder #404) — remove with FactionComplexityPrototype.tsx */
import { PrototypeComplexityToolbarIndicator } from '@app/widgets/faction-editor/FactionComplexityPrototype';
import { FactionEditor } from '@app/widgets/faction-editor/FactionEditor';
import type { FactionAuthoringViewHandle } from '@app/widgets/faction-editor/FactionEditor';
import { FactionGroupPopover } from '@app/widgets/faction-editor/FactionGroupPopover';
import { FactionLoadPopover } from '@app/widgets/faction-editor/FactionLoadPopover';
import { useFactionAuthoring } from '@app/widgets/faction-editor/useFactionAuthoring';

export const Route = createFileRoute('/_app/factions/$factionId/edit')({
  loader: async ({ params }) => await loadFaction(params.factionId),
  component: FactionEditPage,
});

function FactionEditPage() {
  const { factionId } = Route.useParams();
  const loaderData = Route.useLoaderData();
  const navigate = useNavigate();
  const viewRef = useRef<FactionAuthoringViewHandle | null>(null);
  const updateFaction = useUpdateFaction();
  const deleteFaction = useDeleteFaction();
  const setFactionGroup = useSetFactionGroup();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const factionQuery = useFaction(factionId, {
    initialData: loaderData,
  });
  const { faction, viewerAccess, assignableGroups, assetPublishing } =
    factionQuery.data ?? loaderData;
  const authoringFaction = faction ?? loaderData.faction;
  const authoring = useFactionAuthoring({
    sessionKey: authoringFaction._id,
    initialData: authoringFaction.data,
    persistence: {
      save: async (draft) =>
        await updateFaction.mutateAsync({ input: draft, id: authoringFaction._id }),
      isPending: updateFaction.isPending,
      error: updateFaction.error,
      hasSaved: updateFaction.data !== undefined,
      reset: updateFaction.reset,
    },
    onSaved: (entry) => {
      if (entry.slug !== factionId) {
        navigate({
          to: '/factions/$factionId/edit',
          params: { factionId: entry.slug },
          replace: true,
        });
      }
    },
  });
  const header = (
    <Stack align="center" gap={4}>
      <Anchor
        size="sm"
        renderRoot={(rootProps) => (
          <Link {...rootProps} to="/factions/$factionId" params={{ factionId }} />
        )}
      >
        View faction
      </Anchor>
      <Title order={1}>{faction ? `Edit ${faction.data.name}` : 'Edit faction'}</Title>
      <Text c="dimmed">Changes stay local until you explicitly save them.</Text>
    </Stack>
  );

  if (viewerAccess?.viewer.kind === 'anonymous') {
    return (
      <PageLayout>
        <PageLayout.Header size="compact">{header}</PageLayout.Header>
        <PageLayout.Content>
          <Surface padding="xl">
            <Stack gap="sm">
              <Text>
                <Anchor renderRoot={(rootProps) => <Link {...rootProps} to="/auth/login" />}>
                  Log in
                </Anchor>{' '}
                to edit factions.
              </Text>
              <Anchor
                renderRoot={(rootProps) => (
                  <Link {...rootProps} to="/factions/$factionId" params={{ factionId }} />
                )}
              >
                Back to faction
              </Anchor>
            </Stack>
          </Surface>
        </PageLayout.Content>
      </PageLayout>
    );
  }

  if (!faction) {
    return (
      <PageLayout>
        <PageLayout.Header size="compact">{header}</PageLayout.Header>
        <PageLayout.Content>
          <Text>Loading faction…</Text>
        </PageLayout.Content>
      </PageLayout>
    );
  }

  if (!viewerAccess?.capabilities.edit) {
    return (
      <PageLayout>
        <PageLayout.Header size="compact">{header}</PageLayout.Header>
        <PageLayout.Content>
          <Surface padding="xl">
            <Text>
              {faction.group_id
                ? 'Only the faction owner or an active member of its group can edit this faction.'
                : 'Only the faction owner can edit this faction.'}
            </Text>
          </Surface>
        </PageLayout.Content>
      </PageLayout>
    );
  }

  const assignedGroup = viewerAccess.assignedGroup;
  const canDelete = viewerAccess.capabilities.delete;
  const canAssignGroup = viewerAccess.capabilities.changeGroup;

  return (
    <PageLayout>
      <PageLayout.Header size="compact">{header}</PageLayout.Header>
      <PageLayout.Toolbar>
        <FactionAuthoringToolbar
          status={{
            isDirty: authoring.editing.isDirty,
            isNameBlank: authoring.editing.isNameBlank,
            warningCount: authoring.editing.warnings.length,
            saveState: authoring.persistence.saveState,
            assetPublishing,
          }}
          actions={{
            onSave: authoring.actions.submit,
            onReviewWarnings: () => viewRef.current?.focusFirstWarning(),
            onReview: (trigger) => viewRef.current?.openReview(trigger),
            onReset: authoring.actions.reset,
            onBack: () =>
              navigate({
                to: '/factions/$factionId',
                params: { factionId },
              }),
          }}
          /* PROTOTYPE (wayfinder #404) */
          centerIndicator={<PrototypeComplexityToolbarIndicator form={authoring.form} />}
          auxiliaryActions={
            <>
              <FactionLoadPopover
                disabled={updateFaction.isPending}
                currentPublicSlug={faction.slug}
                onLoaded={authoring.actions.loadDraft}
              />
              {canAssignGroup && !assignedGroup ? (
                <FactionGroupPopover
                  disabled={setFactionGroup.isPending}
                  assignableGroups={assignableGroups}
                  onAssignGroup={async (nextGroupId) => {
                    await setFactionGroup.mutateAsync({
                      id: faction._id,
                      groupId: nextGroupId,
                    });
                  }}
                />
              ) : null}
              {canAssignGroup && assignedGroup ? (
                <IconAction
                  label="Remove group"
                  variant="light"
                  color="red"
                  size="lg"
                  disabled={setFactionGroup.isPending}
                  onClick={() =>
                    void setFactionGroup.mutateAsync({ id: faction._id, groupId: null })
                  }
                  icon={<UserRoundMinus size={17} aria-hidden />}
                />
              ) : null}
            </>
          }
          context={
            assignedGroup ? (
              <Text size="xs" c="dimmed">
                Group access: <strong>{assignedGroup.name}</strong>
              </Text>
            ) : null
          }
          destructiveActions={
            canDelete ? (
              confirmDelete ? (
                <Group gap={4} wrap="nowrap" role="group" aria-label="Confirm faction deletion">
                  <Text size="xs" c="red" fw={700}>
                    Delete faction?
                  </Text>
                  <Button
                    type="button"
                    color="red"
                    size="compact-xs"
                    loading={deleteFaction.isPending}
                    onClick={() => {
                      void (async () => {
                        await deleteFaction.mutateAsync({ id: faction._id });
                        navigate({ to: '/factions' });
                      })();
                    }}
                  >
                    Delete
                  </Button>
                  <Button
                    type="button"
                    variant="subtle"
                    color="gray"
                    size="compact-xs"
                    onClick={() => setConfirmDelete(false)}
                  >
                    Cancel
                  </Button>
                </Group>
              ) : (
                <IconAction
                  label="Delete faction"
                  variant="light"
                  color="red"
                  size="lg"
                  onClick={() => setConfirmDelete(true)}
                  icon={<Trash2 size={17} aria-hidden />}
                />
              )
            ) : null
          }
        />
      </PageLayout.Toolbar>
      <PageLayout.Content>
        <FactionEditor
          key={faction._id}
          ref={viewRef}
          form={authoring.form}
          errors={authoring.persistence.errors}
          isNameBlank={authoring.editing.isNameBlank}
          warnings={authoring.editing.warnings}
        />
      </PageLayout.Content>
    </PageLayout>
  );
}
