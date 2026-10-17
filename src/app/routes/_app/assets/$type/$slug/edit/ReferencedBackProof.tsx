import { Stack, Text } from '@mantine/core';
import type { ReactNode } from 'react';

/**
 * The proof of a back worn from another token, shared by the token and enhance token pages, create and edit alike.
 * `proof` is the drawn back, or null when the target's stored back no longer reads as an authored one.
 */
export function ReferencedBackProof({ from, proof }: { from: string; proof: ReactNode }) {
  return (
    <Stack gap={4} align="center" w="100%">
      {proof ?? (
        <Text size="xs" c="dimmed">
          Its stored back can no longer be read as an authored back, so it cannot be shown here.
        </Text>
      )}
      <Text size="xs" c="dimmed">
        Back, from {from}
      </Text>
    </Stack>
  );
}
