import { Group, Text } from '@mantine/core';
import { NameDisc } from '@ui/content/NameDisc';

/** Enough of a person to offer them: the shape both profile-picking queries answer with. */
export type PickableProfileRow = {
  userId: string;
  slug: string;
  username: string;
  avatarUrl: string | null;
};

/** One person as a profile picker lists them: their disc, their name, and their address beneath it. Pure; the pickers own the rows and the pick. */
export function ProfileOptionContent({ profile }: { profile: PickableProfileRow }) {
  return (
    <Group wrap="nowrap">
      <NameDisc src={profile.avatarUrl} name={profile.username} size={26} />
      <div>
        <Text size="sm" fw={700}>
          {profile.username}
        </Text>
        <Text size="xs" c="dimmed">
          /profiles/{profile.slug}
        </Text>
      </div>
    </Group>
  );
}
