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

import {
  type Faction,
  useDeleteFaction,
  useFaction,
  useSetFactionGroup,
  useUpdateFaction,
} from '@db/factions';
import { useCurrentProfile } from '@db/profiles';
import { FactionAuthoringToolbar } from '@app/components/factions/editor/FactionAuthoringToolbar';
import {
  FactionEditor,
  type FactionEditorHandle,
  type FactionEditorState,
} from '@app/components/factions/editor/FactionEditor';
import { FactionGroupPopover } from '@app/components/factions/editor/FactionGroupPopover';
import { FactionLoadPopover } from '@app/components/factions/editor/FactionLoadPopover';
import { PageLayout } from '@app/components/shell';
import { loadFaction } from '@app/factions/db';
import { FactionInputSchema } from '@game/schema/faction';

export const Route = createFileRoute('/_app/factions/$factionId/edit')({
  loader: async ({ params }) => await loadFaction(params.factionId),
  component: FactionEditPage,
});

const initialEditorState: FactionEditorState = {
  isDirty: false,
  isNameBlank: false,
  warnings: [],
};

function formatZodIssues(err: { issues: readonly { path: PropertyKey[]; message: string }[] }) {
  return err.issues
    .map((issue) => {
      const path = issue.path.map((segment) => String(segment)).join('.') || '(root)';
      return `${path}: ${issue.message}`;
    })
    .join('\n');
}

function FactionEditPage() {
  const { factionId } = Route.useParams();
  const loaderData = Route.useLoaderData();
  const navigate = useNavigate();
  const editorRef = useRef<FactionEditorHandle | null>(null);
  const updateFaction = useUpdateFaction();
  const deleteFaction = useDeleteFaction();
  const setFactionGroup = useSetFactionGroup();
  const profile = useCurrentProfile();
  const [editorErrors, setEditorErrors] = useState<string[]>([]);
  const [editorState, setEditorState] = useState<FactionEditorState>(initialEditorState);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { faction, group, assetPublishing } = useFaction(factionId, { initialData: loaderData });
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

  if (!profile.data?.user_id) {
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

  const canDelete = faction.owner_id === profile.data.user_id;
  const canAssignGroup = canDelete;

  const handleEditorSubmit = (values: Faction) => {
    const parsed = FactionInputSchema.safeParse(values);
    if (!parsed.success) {
      setEditorErrors([formatZodIssues(parsed.error)]);
      return;
    }
    setEditorErrors([]);
    void (async () => {
      try {
        const entry = await updateFaction.mutateAsync({ input: parsed.data, id: faction._id });
        editorRef.current?.markSaved(entry.data);
        if (entry.slug !== factionId) {
          navigate({
            to: '/factions/$factionId/edit',
            params: { factionId: entry.slug },
            replace: true,
          });
        }
      } catch (error) {
        setEditorErrors([
          error instanceof Error ? error.message : 'The faction could not be saved.',
        ]);
      }
    })();
  };

  const saveState = updateFaction.isPending
    ? 'saving'
    : updateFaction.isError
      ? 'error'
      : updateFaction.data
        ? 'saved'
        : 'idle';

  return (
    <PageLayout
      header={header}
      headerSize="compact"
      toolbar={
        <FactionAuthoringToolbar
          isDirty={editorState.isDirty}
          isNameBlank={editorState.isNameBlank}
          warningCount={editorState.warnings.length}
          saveState={saveState}
          assetPublishing={assetPublishing}
          onSave={() => editorRef.current?.submit()}
          onReviewWarnings={() => editorRef.current?.focusFirstWarning()}
          onReset={() => editorRef.current?.load()}
          onClose={() =>
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
                onLoaded={(loaded) => editorRef.current?.load(loaded)}
              />
              {canAssignGroup && !group ? (
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
              {canAssignGroup && group ? (
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
            group ? (
              <Text size="xs" c="dimmed">
                Group access: <strong>{group.name ?? group._id}</strong>
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
        ref={editorRef}
        factionEntry={faction}
        errors={editorErrors}
        onSubmit={handleEditorSubmit}
        onStateChange={setEditorState}
      />
    </PageLayout>
  );
}
