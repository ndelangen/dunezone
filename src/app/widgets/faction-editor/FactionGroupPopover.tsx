import { GroupAssignPopover } from '@app/components/groups/GroupAssignPopover';

import type { AssignedGroupSummary } from '../../../../convex/lib/collaborativeAccess';

export interface FactionGroupPopoverProps {
  disabled: boolean;
  assignableGroups: AssignedGroupSummary[];
  onAssignGroup: (groupId: string) => Promise<void>;
}

export function FactionGroupPopover({
  onAssignGroup,
  disabled,
  assignableGroups,
}: FactionGroupPopoverProps) {
  return (
    <GroupAssignPopover
      disabled={disabled}
      assignableGroups={assignableGroups}
      onAssignGroup={onAssignGroup}
      title="Assign Group"
      descriptionLines={[
        'Groups are used to allow group members to edit this faction.',
        'You can create groups on your profile page.',
      ]}
    />
  );
}
