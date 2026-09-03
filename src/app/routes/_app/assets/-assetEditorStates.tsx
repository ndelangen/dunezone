import { Alert, Group, Text } from '@mantine/core';
import { ASSET_TYPES, isAssetType } from '@shared/assets/types';
import { useNavigate } from '@tanstack/react-router';
import { NotAvailable } from '@ui/block/NotAvailable';
import { AssignOptions, AssignPopover } from '@ui/control/AssignPopover';
import { ConfirmDeleteAction } from '@ui/control/ConfirmDeleteAction';
import { IconAction } from '@ui/control/IconAction';
import { UserRoundMinus, UsersRound } from 'lucide-react';
import { useState } from 'react';
import type { ReactNode } from 'react';

import { useDeleteAsset, useSetAssetGroup } from '@app/db/assets';
import type { AssetPageData } from '@app/db/assets';
import { mutationErrorMessage } from '@app/db/core/mutationError';
import { AssetNameInput } from '@app/pickers/AssetNameInput';
import { nameConflictComplaint } from '@app/pickers/UniqueNameInput';
import type { NameConflict } from '@app/pickers/UniqueNameInput';
import { PageMessage } from '@app/widgets/page-message/PageMessage';

/**
 * The words `PageMessage` wears on an asset editor route, and the destination its way back points at.
 *
 * It used to be the frame itself, built independently of the widget and predating it: its own `PageLayout`, its own compact header, its own `Surface`, its own anchor below the words.
 * The frame is `PageMessage`'s now, so what is left here is the part that is genuinely this feature's: a known type goes back to its own browse page and anything else to the landing, which is a fact about the asset registry rather than about message frames.
 * `AssetDetailMessage` on the detail route is the same shape for the same reason, so the two siblings now differ only in which browse page they name.
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
    <PageMessage
      size="compact"
      title={title}
      back={
        isAssetType(type) ? (
          <PageMessage.Back to="/assets/$type" params={{ type }}>
            Back to {ASSET_TYPES[type].label.toLowerCase()}
          </PageMessage.Back>
        ) : (
          <PageMessage.Back to="/assets">Back to assets</PageMessage.Back>
        )
      }
    >
      {children}
    </PageMessage>
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
 * The message stays the caller's, because each editor names its own schema, and they are not interchangeable: four of the five say "the token schema" or "the deck schema" after their own noun, while the treachery editor says "the treachery card schema" after "card".
 * The delete affordance is what every drifted asset shares.
 *
 * This is the one state here that is not one of the four bodies, because it ends in an action rather than in words: the heading and sentence are a `NotAvailable`, and the offer to delete sits beside it in the same slot.
 */
export function DriftedAssetPage({
  asset,
  noun,
  canDelete,
  children,
}: {
  asset: NonNullable<AssetPageData>['asset'];
  /** The word on the delete control and in the heading: "Delete card", "This card cannot be edited". */
  noun: string;
  canDelete: boolean;
  /** Why this one cannot open, naming the schema the editor actually parses against. */
  children: string;
}) {
  const deletion = useAssetDeletion(asset);

  return (
    <AssetEditorMessage title={`Edit ${asset.name}`} type={asset.type}>
      <NotAvailable title={`This ${noun} cannot be edited`}>{children}</NotAvailable>
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
    <AssetEditorMessage title={isAssetType(type) ? ASSET_TYPES[type].label : 'Assets'} type={type}>
      <NotAvailable title="No editor yet">
        {`There is no editor for ${label} yet. This type is on the roadmap and cannot hold assets so far.`}
      </NotAvailable>
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
      emphasis="standard"
      intent="negative"
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
    >
      <AssignOptions
        options={access.assignableGroups.map((group) => ({
          value: group.id,
          label: `${group.name} (${group.slug})`,
        }))}
        onAssign={async (nextGroupId) => {
          await setAssetGroup.mutateAsync({ id: asset.id, group_id: nextGroupId });
        }}
      />
    </AssignPopover>
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

/**
 * The route's half of the name field: state for the conflict the Picker reports, the ready warning rows for the validation header, and the field node the editor widget mounts.
 *
 * The field itself is `AssetNameInput`, a Picker (the taxonomy's one fetching control), so no route holds a second page subscription and no widget fetches.
 * Norbert ruled it so on 2026-08-22: the earlier rulebook exception was the wrong answer, and the right one was making the field a Picker.
 * Finding 19 of «Walk findings, round two» is the why: a card named Shield met the reserved slug of the existing Shield card and the reader learned nothing.
 */
export function useAssetNameField<Chapter extends string>({
  type,
  name,
  onName,
  currentSlug,
  source,
  chapter,
  canRename,
  noun,
}: {
  type: string;
  name: string;
  onName: (name: string) => void;
  currentSlug?: string;
  /** The validation header group the warning joins, Identity everywhere but the treachery card, whose name lives in Head. */
  source: string;
  chapter: Chapter;
  /** Whether this viewer may rename the asset, which only its owner may (#605). A create page states `true`: its viewer is the owner-to-be. */
  canRename: boolean;
  /** What the asset is called in the locked field's explanation, as in "Only the token owner can rename it." */
  noun?: string;
}): { nameField: ReactNode; conflictWarnings: { source: string; complaint: string; chapter: Chapter }[] } {
  const [conflict, setConflict] = useState<NameConflict | null>(null);
  return {
    nameField: (
      <AssetNameInput
        type={type}
        value={name}
        onChange={onName}
        currentSlug={currentSlug}
        onConflictChange={setConflict}
        canRename={canRename}
        noun={noun}
      />
    ),
    conflictWarnings: conflict ? [{ source, complaint: nameConflictComplaint(conflict), chapter }] : [],
  };
}

/**
 * The alert under a failed save, once for every editor organ.
 * It replaced ten hand-written copies of the same Alert, whose only drift risk was exactly the ConvexError unwrap it applies.
 */
export function SaveErrorAlert({ error }: { error: Error | null }) {
  if (!error) {
    return null;
  }
  return (
    <Alert color="red" variant="light" role="alert" title="Could not save">
      {mutationErrorMessage(error)}
    </Alert>
  );
}
