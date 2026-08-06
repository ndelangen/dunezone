import { List, Text } from '@mantine/core';
import { Link } from '@tanstack/react-router';

import type { AssignedGroupSummary } from '../../../../convex/lib/collaborativeAccess';

export function ProfileGroupMemberships({ groups }: { groups: AssignedGroupSummary[] }) {
  if (groups.length === 0) {
    return (
      <Text c="dimmed" m={0} size="sm">
        Not a member of any groups.
      </Text>
    );
  }

  return (
    <List m={0} pl="md" spacing="xs">
      {groups.map((group) => (
        <List.Item key={group.id}>
          <Link to="/groups/$groupSlug" params={{ groupSlug: group.slug }}>
            {group.name}
          </Link>
        </List.Item>
      ))}
    </List>
  );
}
