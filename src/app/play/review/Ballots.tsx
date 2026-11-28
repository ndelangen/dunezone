import { Group, Stack, Text } from '@mantine/core';
import { StatusBadge } from '@ui/content/StatusBadge';
import type { StatusBadgeTone } from '@ui/content/StatusBadge';

type Badge = Readonly<{ tone: StatusBadgeTone; label: string }>;

/**
 * Who has voted and how, one row per seat: the table review and the removal vote both list their ballots this way.
 * Each caller names its own choices, since "Agreed" and "Remove" are that vote's words, and `uncast` covers a ballot not cast yet.
 */
export function Ballots<Choice extends string>({
  ballots,
  badges,
}: Readonly<{
  ballots: readonly Readonly<{ name: string; seat: string; choice: Choice | null }>[];
  badges: Readonly<Record<Choice | 'uncast', Badge>>;
}>) {
  return (
    <Stack gap={4}>
      {ballots.map((ballot, index) => {
        const badge = badges[ballot.choice ?? 'uncast'];
        return (
          <Group key={`${ballot.seat}-${index}`} justify="space-between" gap="sm">
            <Text size="sm">{ballot.name}</Text>
            <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
          </Group>
        );
      })}
    </Stack>
  );
}
