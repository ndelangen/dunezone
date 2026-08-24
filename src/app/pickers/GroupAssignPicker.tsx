import { AssignOptions, useAssignPane } from '@ui/control/AssignPopover';

import { useFactionsOwnedForGroupAssign } from '@db/factions';
import { useRulesetsOwnedForGroupAssign } from '@db/rulesets';

/** Enough of an owned asset to offer it and to say where it currently lives. */
export type OwnedAssignItem = {
  id: string;
  name: string;
  groupId: string | null;
  groupName: string | null;
};

export type GroupAssignPickerProps = {
  /** The group being added to, so an asset already in it is not offered. */
  currentGroupId: string;
  /**
   * Reports the choice.
   * The page decides what happens next, including whether to ask first: resolve `false` to leave the pane open, which is how a reader backs out of a move.
   */
  onPick: (item: OwnedAssignItem) => Promise<boolean | void>;
};

/**
 * The presentation both owned-asset pickers share, once one of them has its rows.
 * `noun` comes from the pane rather than a prop, so the words the shell chose and the words here cannot disagree.
 */
function OwnedAssignOptions({
  items,
  loading,
  currentGroupId,
  onPick,
}: GroupAssignPickerProps & { items: OwnedAssignItem[]; loading: boolean }) {
  const { noun } = useAssignPane();
  const assignable = items.filter((item) => item.groupId !== currentGroupId);
  const byId = new Map(assignable.map((item) => [item.id, item]));

  return (
    <AssignOptions
      loading={loading}
      searchLabel={`Search your ${noun}s`}
      emptyMessage={
        items.length === 0 ? `You don't own any ${noun}s yet.` : `All your ${noun}s are already in this group.`
      }
      options={assignable.map((item) => ({
        value: item.id,
        label: item.groupName ? `${item.name} — currently in ${item.groupName}` : `${item.name} — unassigned`,
      }))}
      onAssign={async (value) => {
        const item = byId.get(value);
        if (!item) {
          return false;
        }
        return await onPick(item);
      }}
    />
  );
}

/**
 * The factions this viewer owns, offered for adding to a group.
 *
 * Mounted inside an `AssignPopover`, which mounts its content only while open, so the read starts when the reader signals intent and is torn down when they leave.
 * Its query requires authentication, so only mount it for an active member.
 * The owned lists are their own queries rather than part of the page bundle, decided on «Group detail's owned-asset lists» (#348/#182);
 * what changed since is only when they are subscribed to.
 */
export function OwnedFactionAssignPicker(props: GroupAssignPickerProps) {
  const owned = useFactionsOwnedForGroupAssign();
  return <OwnedAssignOptions items={owned.data ?? []} loading={owned.isLoading} {...props} />;
}

/** The rulesets this viewer owns. Same rules as the faction picker: active members only. */
export function OwnedRulesetAssignPicker(props: GroupAssignPickerProps) {
  const owned = useRulesetsOwnedForGroupAssign();
  return <OwnedAssignOptions items={owned.data ?? []} loading={owned.isLoading} {...props} />;
}
