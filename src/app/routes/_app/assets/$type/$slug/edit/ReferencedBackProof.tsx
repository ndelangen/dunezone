import { Stack, Text } from '@mantine/core';
import type { ReactNode } from 'react';

/** The token a draft's back is worn from, as the pages hold it once picked or loaded. */
type PickedBack = { name: string; data: unknown };

/**
 * The proof of a back worn from another token, shared by the token and enhance token pages, create and edit alike.
 * `readFace` reads the picked token's stored back, and gives null when it no longer reads as an authored one, which the proof then says instead of drawing it.
 */
export function referencedBackProof<Face>(
  picked: PickedBack | null,
  readFace: (data: unknown) => Face | null,
  draw: (face: Face) => ReactNode
): ReactNode {
  if (!picked) {
    return null;
  }
  const face = readFace(picked.data);
  return (
    <Stack gap={4} align="center" w="100%">
      {face ? (
        draw(face)
      ) : (
        <Text size="xs" c="dimmed">
          Its stored back can no longer be read as an authored back, so it cannot be shown here.
        </Text>
      )}
      <Text size="xs" c="dimmed">
        Back, from {picked.name}
      </Text>
    </Stack>
  );
}

/** A create page cannot pick a back yet, but a loaded token can bring one; this says which, or why there is none. */
export function CreateBackNote({ picked }: { picked: PickedBack | null }) {
  return (
    <Text size="xs" c="dimmed">
      {picked
        ? `Wears the back of ${picked.name}. Choose another after saving.`
        : 'A token can point at an existing token only once it has been saved.'}
    </Text>
  );
}
