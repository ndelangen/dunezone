import { Alert, Anchor, Button, Group, Stack, Text, Title, UnstyledButton } from '@mantine/core';
import { isRouteNoticeCode } from '@shared/routeNotices';
import type { RouteNoticeCode } from '@shared/routeNotices';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { IconAction } from '@ui/control/IconAction';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';
import { TriangleAlert, Trash2, UserRoundMinus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { useDeleteFaction, useFaction, useSetFactionGroup, useUpdateFaction } from '@db/factions';
import { loadFaction } from '@db/factions';
import { resolveRouteNotice } from '@app/routes/-routeNotices';
import type { FactionAuthoringWarning } from '@app/widgets/faction-editor/factionAuthoringContract';
import { FactionAuthoringToolbar } from '@app/widgets/faction-editor/FactionAuthoringToolbar';
import { FactionComplexityIndicator } from '@app/widgets/faction-editor/FactionComplexityIndicator';
import { FactionEditor } from '@app/widgets/faction-editor/FactionEditor';
import type { FactionAuthoringViewHandle } from '@app/widgets/faction-editor/FactionEditor';
import { FactionGroupPopover } from '@app/widgets/faction-editor/FactionGroupPopover';
import { FactionLoadPopover } from '@app/widgets/faction-editor/FactionLoadPopover';
import { useFactionAuthoring } from '@app/widgets/faction-editor/useFactionAuthoring';

import styles from './edit.module.css';

export const Route = createFileRoute('/_app/factions/$factionId/edit')({
  validateSearch: (params: Record<string, unknown>): { notice?: RouteNoticeCode } => {
    if (isRouteNoticeCode(params?.notice)) {
      return { notice: params.notice };
    }
    return {};
  },
  loader: async ({ params }) => await loadFaction(params.factionId),
  component: FactionEditPage,
});

const VALIDATION_HEADER_ID = 'faction-validation-header';

/* The masthead's replacement exists only while validation warnings exist.
   Asymmetric settle — new warnings open it immediately, but an empty list only closes it
   on a settle signal (field blur or chapter switch), never mid-keystroke, so the layout
   never jumps above the sticky toolbar while typing. The open state gates the
   PageLayout.Header slot itself; the shell's band already animates its height change. */
function useValidationHeaderOpen(count: number, settleTick: number): boolean {
  const [open, setOpen] = useState(count > 0);
  const countRef = useRef(count);

  /* The ref syncs inside the committed effect — a render-phase write could survive from a
     discarded render and let a later settle close the header while warnings still show.
     Declared before the settle effect so a commit changing both runs the sync first. */
  useEffect(() => {
    countRef.current = count;
    if (count > 0) {
      setOpen(true);
    }
  }, [count]);

  useEffect(() => {
    if (countRef.current === 0) {
      setOpen(false);
    }
  }, [settleTick]);

  return open;
}

function formatMissingList(missing: string[]): string {
  if (missing.length <= 1) {
    return missing[0] ?? '';
  }
  return `${missing.slice(0, -1).join(', ')} and ${missing[missing.length - 1]}`;
}

/* A lower-third caption strip on the artwork band: one chip per source, each a focus jump. */
function ValidationHeader({
  warnings,
  onFocusWarning,
}: {
  warnings: FactionAuthoringWarning[];
  onFocusWarning: (warning: FactionAuthoringWarning) => void;
}) {
  const groups = new Map<string, FactionAuthoringWarning[]>();
  warnings.forEach((warning) => {
    const group = groups.get(warning.source);
    if (group) {
      group.push(warning);
    } else {
      groups.set(warning.source, [warning]);
    }
  });

  return (
    <div className={styles.strip} id={VALIDATION_HEADER_ID}>
      <span className={styles.title}>
        <TriangleAlert size={15} aria-hidden />
        Incomplete fields
      </span>
      {[...groups.entries()].map(([source, sourceWarnings]) => (
        <UnstyledButton
          key={source}
          className={styles.chip}
          onClick={() => onFocusWarning(sourceWarnings[0] as FactionAuthoringWarning)}
        >
          <span className={styles.chipSource}>{source}</span>: missing{' '}
          {formatMissingList(sourceWarnings.map((warning) => warning.missing))}
        </UnstyledButton>
      ))}
    </div>
  );
}

function FactionEditPage() {
  const { factionId } = Route.useParams();
  const search = Route.useSearch();
  const loaderData = Route.useLoaderData();
  const navigate = useNavigate();
  const viewRef = useRef<FactionAuthoringViewHandle | null>(null);
  const updateFaction = useUpdateFaction();
  const deleteFaction = useDeleteFaction();
  const setFactionGroup = useSetFactionGroup();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [settleTick, setSettleTick] = useState(0);

  const factionQuery = useFaction(factionId, {
    initialData: loaderData,
  });
  const { faction, viewerAccess, assignableGroups, assetPublishing } = factionQuery.data ?? loaderData;
  const authoringFaction = faction ?? loaderData.faction;
  const authoring = useFactionAuthoring({
    sessionKey: authoringFaction._id,
    initialData: authoringFaction.data,
    persistence: {
      save: async (draft) => await updateFaction.mutateAsync({ input: draft, id: authoringFaction._id }),
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
  const validationHeaderOpen = useValidationHeaderOpen(authoring.editing.warnings.length, settleTick);
  const header = (
    <Stack align="center" gap={4}>
      <Anchor
        size="sm"
        renderRoot={(rootProps) => <Link {...rootProps} to="/factions/$factionId" params={{ factionId }} />}
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
                <Anchor renderRoot={(rootProps) => <Link {...rootProps} to="/auth/login" />}>Log in</Anchor> to edit
                factions.
              </Text>
              <Anchor
                renderRoot={(rootProps) => <Link {...rootProps} to="/factions/$factionId" params={{ factionId }} />}
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
  const routeNotice = resolveRouteNotice(search.notice);
  const dismissRouteNotice = () =>
    navigate({
      to: '.',
      search: (previous) => ({ ...previous, notice: undefined }),
      replace: true,
    });

  return (
    <PageLayout>
      {validationHeaderOpen ? (
        <PageLayout.Header size="compact">
          <ValidationHeader
            warnings={authoring.editing.warnings}
            onFocusWarning={(warning) => viewRef.current?.focusWarning(warning)}
          />
        </PageLayout.Header>
      ) : null}
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
            /* The toolbar count is the persistent indicator; clicking it returns
               to the expanded validation header at the top of the page. */
            onReviewWarnings: () =>
              document.getElementById(VALIDATION_HEADER_ID)?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
            onReview: (trigger) => viewRef.current?.openReview(trigger),
            onReset: authoring.actions.reset,
            onBack: () =>
              navigate({
                to: '/factions/$factionId',
                params: { factionId },
              }),
          }}
          centerIndicator={<FactionComplexityIndicator form={authoring.form} />}
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
                  onClick={() => void setFactionGroup.mutateAsync({ id: faction._id, groupId: null })}
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
        <Stack gap="sm">
          {routeNotice ? (
            <Alert
              color={routeNotice.color}
              title={routeNotice.title}
              role="alert"
              withCloseButton
              onClose={dismissRouteNotice}
            >
              {routeNotice.message}
            </Alert>
          ) : null}
          <FactionEditor
            key={faction._id}
            ref={viewRef}
            form={authoring.form}
            errors={authoring.persistence.errors}
            isNameBlank={authoring.editing.isNameBlank}
            warnings={authoring.editing.warnings}
            onSettle={() => setSettleTick((tick) => tick + 1)}
          />
        </Stack>
      </PageLayout.Content>
    </PageLayout>
  );
}
