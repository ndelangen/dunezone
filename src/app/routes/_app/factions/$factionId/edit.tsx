import {
  ActionIcon,
  Anchor,
  Button,
  Group,
  Paper,
  Stack,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { Trash2, UserRoundMinus } from 'lucide-react';
import { useRef, useState } from 'react';

import { useDeleteFaction, useFaction, useSetFactionGroup, useUpdateFaction } from '@db/factions';
import { useCurrentProfile } from '@db/profiles';
import { FactionAuthoringToolbar } from '@app/components/factions/editor/FactionAuthoringToolbar';
import { FactionEditor } from '@app/components/factions/editor/FactionEditor';
import type { FactionAuthoringViewHandle } from '@app/components/factions/editor/FactionEditor';
import { FactionGroupPopover } from '@app/components/factions/editor/FactionGroupPopover';
import { FactionLoadPopover } from '@app/components/factions/editor/FactionLoadPopover';
import { useFactionAuthoring } from '@app/components/factions/editor/useFactionAuthoring';
import { PageLayout } from '@app/components/shell';
import { loadFaction } from '@app/factions/db';

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
  const profile = useCurrentProfile();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { faction, viewerAccess, assetPublishing } = useFaction(factionId, {
    initialData: loaderData,
  });
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
      <PageLayout header={header} headerSize="compact">
        <Paper withBorder radius="md" p="xl">
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
        </Paper>
      </PageLayout>
    );
  }

  if (!faction) {
    return (
      <PageLayout header={header} headerSize="compact">
        <Text>Loading faction…</Text>
      </PageLayout>
    );
  }

  if (!viewerAccess?.capabilities.edit) {
    return (
      <PageLayout header={header} headerSize="compact">
        <Paper withBorder radius="md" p="xl">
          <Text>
            {faction.group_id
              ? 'Only the faction owner or an active member of its group can edit this faction.'
              : 'Only the faction owner can edit this faction.'}
          </Text>
        </Paper>
      </PageLayout>
    );
  }

  const assignedGroup = viewerAccess.assignedGroup;
  const canDelete = viewerAccess.capabilities.delete;
  const canAssignGroup = viewerAccess.capabilities.changeGroup;

  return (
    <PageLayout
      header={header}
      headerSize="compact"
      toolbar={
        <FactionAuthoringToolbar
          isDirty={authoring.editing.isDirty}
          isNameBlank={authoring.editing.isNameBlank}
          warningCount={authoring.editing.warnings.length}
          saveState={authoring.persistence.saveState}
          assetPublishing={assetPublishing}
          onSave={authoring.actions.submit}
          onReviewWarnings={() => viewRef.current?.focusFirstWarning()}
          onReview={(trigger) => viewRef.current?.openReview(trigger)}
          onReset={authoring.actions.reset}
          onBack={() =>
            navigate({
              to: '/factions/$factionId',
              params: { factionId },
            })
          }
          auxiliaryActions={
            <>
              <FactionLoadPopover
                disabled={updateFaction.isPending}
                currentPublicSlug={faction.slug}
                onLoaded={authoring.actions.loadDraft}
              />
              {canAssignGroup && !assignedGroup && profile.data?.user_id ? (
                <FactionGroupPopover
                  disabled={setFactionGroup.isPending}
                  userId={profile.data.user_id}
                  isUserPending={profile.isPending}
                  onChangeGroup={async (nextGroupId) => {
                    await setFactionGroup.mutateAsync({
                      id: faction._id,
                      groupId: nextGroupId,
                    });
                  }}
                />
              ) : null}
              {canAssignGroup && assignedGroup ? (
                <Tooltip label="Remove group">
                  <ActionIcon
                    type="button"
                    variant="light"
                    color="red"
                    size="lg"
                    aria-label="Remove group"
                    disabled={setFactionGroup.isPending}
                    onClick={() =>
                      void setFactionGroup.mutateAsync({ id: faction._id, groupId: null })
                    }
                  >
                    <UserRoundMinus size={17} aria-hidden />
                  </ActionIcon>
                </Tooltip>
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
                <Tooltip label="Delete faction">
                  <ActionIcon
                    type="button"
                    variant="light"
                    color="red"
                    size="lg"
                    aria-label="Delete faction"
                    onClick={() => setConfirmDelete(true)}
                  >
                    <Trash2 size={17} aria-hidden />
                  </ActionIcon>
                </Tooltip>
              )
            ) : null
          }
        />
      }
    >
      <FactionEditor
        key={faction._id}
        ref={viewRef}
        form={authoring.form}
        errors={authoring.persistence.errors}
        isNameBlank={authoring.editing.isNameBlank}
        warnings={authoring.editing.warnings}
      />
    </PageLayout>
  );
}
