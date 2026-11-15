import { Group, Text } from '@mantine/core';
import { GitBranch } from 'lucide-react';

export interface FactionVariantCountProps {
  /** How many variants the faction has. */
  count: number;
}

/**
 * How many variants a faction has, as the variants mark and the number, dimmed, beside the faction's name.
 * A faction with one variant has nothing to count, so it draws nothing, as a list never names a lone variant.
 * It is read aloud as one phrase: "3 variants".
 */
export function FactionVariantCount({ count }: FactionVariantCountProps) {
  if (count < 2) {
    return null;
  }
  return (
    <Group gap="xs" wrap="nowrap" c="dimmed" role="img" aria-label={`${count} variants`}>
      <GitBranch size={14} aria-hidden />
      <Text size="sm" span aria-hidden>
        {count}
      </Text>
    </Group>
  );
}
