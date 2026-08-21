import { Alert, Anchor, Group, Stack, Text, Title } from '@mantine/core';
import { ASSET_TYPES, isAssetType } from '@shared/assets/types';
import { Link, useNavigate } from '@tanstack/react-router';
import { AssignPopover } from '@ui/control/AssignPopover';
import { ConfirmDeleteAction } from '@ui/control/ConfirmDeleteAction';
import { IconAction } from '@ui/control/IconAction';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';
import { UserRoundMinus, UsersRound } from 'lucide-react';
import type { ReactNode } from 'react';

import { useDeleteAsset, useSetAssetGroup } from '@app/db/assets';
import type { AssetPageData } from '@app/db/assets';

/**
 * The states an asset editor route reaches instead of an editor: no such asset, not signed in, not allowed, no editor built yet.
 * Shared by the create and edit routes because both reach most of them, and a message that differs between the two would read as a bug rather than a distinction.
 */
export function AssetEditorMessage({
  title,
  type,
  children,
}: {
  title: string;
  /** Where "back" goes. A known type returns to its browse page, anything else to the landing. */
  type: string;
  children: ReactNode;
}) {
  return (
    <PageLayout>
      <PageLayout.Header size="compact">
        <Stack gap={2} align="center">
          <Title order={1}>{title}</Title>
        </Stack>
      </PageLayout.Header>
      <PageLayout.Content>
        <Surface padding="xl">
          <Stack gap="sm">
            {children}
            {isAssetType(type) ? (
              <Anchor renderRoot={(rootProps) => <Link {...rootProps} to="/assets/$type" params={{ type }} />}>
                Back to {ASSET_TYPES[type].label.toLowerCase()}
              </Anchor>
            ) : (
              <Anchor renderRoot={(rootProps) => <Link {...rootProps} to="/assets" />}>Back to assets</Anchor>
            )}
          </Stack>
        </Surface>
      </PageLayout.Content>
    </PageLayout>
  );
}

/**
 * Deletes an asset and leaves for its type's browse page, since the asset's own address dies with it.
 * Wired once for the two surfaces that offer deletion: an editor's toolbar, and the dead end a drifted asset lands on.
 * Deleting is the caller's to trigger and the page's to navigate away from;
 * this only holds the mutation.
 */
export function useAssetDeletion(asset: Pick<NonNullable<AssetPageData>['asset'], 'id' | 'type'>) {
  const navigate = useNavigate();
  const deleteAsset = useDeleteAsset();
  return {
    pending: deleteAsset.isPending,
    error: deleteAsset.error,
    confirm: () =>
      deleteAsset.mutate(
        { id: asset.id },
        { onSuccess: () => void navigate({ to: '/assets/$type', params: { type: asset.type } }) }
      ),
  };
}

/**
 * An asset whose stored data no longer satisfies its type's schema, reachable whenever a schema tightens ahead of a backfill.
 * The editor cannot open it, but deletion never reads the data, so the owner keeps the one action that still applies rather than needing the database to be rid of it.
 * The message stays the caller's, because each editor names its own schema;
 * the delete affordance is what every drifted asset shares.
 */
export function DriftedAssetPage({
  asset,
  noun,
  canDelete,
  children,
}: {
  asset: NonNullable<AssetPageData>['asset'];
  /** The word on the delete control: "Delete card", "Delete token". */
  noun: string;
  canDelete: boolean;
  children: ReactNode;
}) {
  const deletion = useAssetDeletion(asset);

  return (
    <AssetEditorMessage title={`Edit ${asset.name}`} type={asset.type}>
      {children}
      {canDelete ? (
        <>
          <Text size="sm" c="dimmed">
            Deleting it is still open to you. The drifted data blocks the editor, not the delete.
          </Text>
          {deletion.error ? (
            <Alert color="red" variant="light" role="alert" title="Could not delete">
              {deletion.error.message}
            </Alert>
          ) : null}
          <Group>
            <ConfirmDeleteAction label={`Delete ${noun}`} pending={deletion.pending} onConfirm={deletion.confirm} />
          </Group>
        </>
      ) : null}
    </AssetEditorMessage>
  );
}

/**
 * A type the registry knows but nothing can author yet.
 * The same honest shape the browse page already uses for planned types, rather than a 404 that would claim the type does not exist.
 */
export function NoEditorYet({ type }: { type: string }) {
  const label = isAssetType(type) ? ASSET_TYPES[type].label.toLowerCase() : 'assets of this type';
  return (
    <AssetEditorMessage title="No editor yet" type={type}>
      <Text>There is no editor for {label} yet. This type is on the roadmap and cannot hold assets so far.</Text>
    </AssetEditorMessage>
  );
}

/**
 * Group management for an Asset's edit toolbar: the two pieces `AuthoringToolbar` takes, plus the error surface.
 *
 * Installed rather than copied.
 * Delete and group assign/remove belong on the detail page *and* the edit page of every entity (map Notes, Norbert 2026-08-20), and only the treachery organ had ever wired it.
 * The other four carried zero group references, so a deck's owner had to leave the editor to hand it to a group while the card editor did it in place.
 * Four copies of fifty lines is how that gap reopens one organ at a time.
 *
 * It lives here beside `useAssetDeletion` rather than in the authoring widget, because it mutates and a widget must not fetch.
 *
 * Gated on the viewer's real `changeGroup` capability, which group members never have: reassignment stays with the owner.
 */
export function useAssetGroupActions({
  asset,
  access,
}: {
  asset: { id: NonNullable<AssetPageData>['asset']['id']; name: string };
  access: {
    viewerAccess: NonNullable<AssetPageData>['viewerAccess'];
    assignableGroups: NonNullable<AssetPageData>['assignableGroups'];
  };
}): { auxiliaryActions: ReactNode; context: ReactNode; error: ReactNode } {
  const setAssetGroup = useSetAssetGroup();
  const { assignedGroup, capabilities } = access.viewerAccess;

  const auxiliaryActions = !capabilities.changeGroup ? null : assignedGroup ? (
    <IconAction
      label="Remove group"
      variant="light"
      color="red"
      size="lg"
      disabled={setAssetGroup.isPending}
      onClick={() => setAssetGroup.mutate({ id: asset.id, group_id: null })}
      icon={<UserRoundMinus size={17} aria-hidden />}
    />
  ) : (
    <AssignPopover
      noun="group"
      triggerLabel="Assign group"
      icon={<UsersRound size={17} aria-hidden />}
      title="Assign Group"
      disabled={setAssetGroup.isPending}
      options={access.assignableGroups.map((group) => ({ value: group.id, label: `${group.name} (${group.slug})` }))}
      onAssign={async (nextGroupId) => {
        await setAssetGroup.mutateAsync({ id: asset.id, group_id: nextGroupId });
      }}
    />
  );

  return {
    auxiliaryActions,
    context: assignedGroup ? (
      <Text size="xs" c="dimmed">
        Group access: <strong>{assignedGroup.name}</strong>
      </Text>
    ) : null,
    error: setAssetGroup.error ? (
      <Alert color="red" variant="light" role="alert" title="Could not change group">
        {setAssetGroup.error.message}
      </Alert>
    ) : null,
  };
}
