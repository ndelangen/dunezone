import { Anchor, Paper, Stack, Text, Title } from '@mantine/core';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useMemo, useRef, useState } from 'react';

import { type Faction, type FactionEntry, useCreateFaction } from '@db/factions';
import { useCurrentProfile } from '@db/profiles';
import { FactionAuthoringToolbar } from '@app/components/factions/editor/FactionAuthoringToolbar';
import {
  FactionEditor,
  type FactionEditorHandle,
  type FactionEditorState,
} from '@app/components/factions/editor/FactionEditor';
import { FactionLoadPopover } from '@app/components/factions/editor/FactionLoadPopover';
import { PageLayout } from '@app/components/shell';
import { defaultFaction } from '@data/defaultFaction';
import { FactionInputSchema, factionSlugBaseFromName } from '@game/schema/faction';

export const Route = createFileRoute('/_app/factions/create')({
  component: CreateFactionPage,
});

const initialEditorState: FactionEditorState = {
  isDirty: false,
  isNameBlank: false,
  warnings: [],
};

function toSyntheticFactionEntry(
  defaultFactionData: typeof defaultFaction,
  ownerId: string
): FactionEntry {
  const now = new Date().toISOString();
  return {
    _id: 'new' as never,
    _creationTime: Date.now(),
    owner_id: ownerId as never,
    data: structuredClone(defaultFactionData),
    slug: factionSlugBaseFromName(defaultFactionData.name),
    group_id: null,
    created_at: now,
    updated_at: now,
    is_deleted: false,
  };
}

function formatZodIssues(err: { issues: readonly { path: PropertyKey[]; message: string }[] }) {
  return err.issues
    .map((issue) => {
      const path = issue.path.map((segment) => String(segment)).join('.') || '(root)';
      return `${path}: ${issue.message}`;
    })
    .join('\n');
}

function CreateFactionPage() {
  const profile = useCurrentProfile();
  const ownerUserId = profile.data?.user_id;
  const navigate = useNavigate();
  const createFaction = useCreateFaction();
  const editorRef = useRef<FactionEditorHandle | null>(null);
  const [editorErrors, setEditorErrors] = useState<string[]>([]);
  const [editorState, setEditorState] = useState<FactionEditorState>(initialEditorState);
  const syntheticEntry = useMemo(
    () => toSyntheticFactionEntry(defaultFaction, ownerUserId ?? 'unavailable'),
    [ownerUserId]
  );

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

  const handleEditorSubmit = (values: Faction) => {
    const parsed = FactionInputSchema.safeParse(values);
    if (!parsed.success) {
      setEditorErrors([formatZodIssues(parsed.error)]);
      return;
    }
    setEditorErrors([]);
    void (async () => {
      try {
        const entry = await createFaction.mutateAsync({ input: parsed.data, groupId: null });
        editorRef.current?.markSaved(entry.data);
        navigate({
          to: '/factions/$factionId/edit',
          params: { factionId: entry.slug },
        });
      } catch (error) {
        setEditorErrors([
          error instanceof Error ? error.message : 'The faction could not be saved.',
        ]);
      }
    })();
  };

  const saveState = createFaction.isPending
    ? 'saving'
    : createFaction.isError
      ? 'error'
      : createFaction.data
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
          onSave={() => editorRef.current?.submit()}
          onReviewWarnings={() => editorRef.current?.focusFirstWarning()}
          onReset={() => editorRef.current?.load()}
          onClose={() => navigate({ to: '/factions' })}
          auxiliaryActions={
            <FactionLoadPopover
              disabled={createFaction.isPending}
              currentPublicSlug={syntheticEntry.slug}
              onLoaded={(loaded) => editorRef.current?.load(loaded)}
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
        ref={editorRef}
        factionEntry={syntheticEntry}
        errors={editorErrors}
        onSubmit={handleEditorSubmit}
        onStateChange={setEditorState}
      />
    </PageLayout>
  );
}
