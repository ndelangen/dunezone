import { AssignPopover } from '@ui/control/AssignPopover';
import { Users } from 'lucide-react';

import type { AssignedGroupSummary } from '@db/groups';

export interface FactionGroupPopoverProps {
  disabled: boolean;
  assignableGroups: AssignedGroupSummary[];
  onAssignGroup: (groupId: string) => Promise<void>;
}

/** Labels the editor's groups for `AssignPopover`, which knows nothing about groups itself. */
export function FactionGroupPopover({
  onAssignGroup,
  disabled,
  assignableGroups,
}: FactionGroupPopoverProps) {
  return (
    <AssignPopover
      noun="group"
      triggerLabel="Assign group"
      icon={<Users size={17} aria-hidden />}
      title="Assign Group"
      descriptionLines={[
        'Groups are used to allow group members to edit this faction.',
        'You can create groups on your profile page.',
      ]}
      disabled={disabled}
      options={assignableGroups.map((group) => ({
        value: group.id,
        label: `${group.name} (${group.slug})`,
      }))}
      onAssign={onAssignGroup}
    />
  );
}
