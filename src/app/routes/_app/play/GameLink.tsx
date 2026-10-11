import { Button, Stack, Text } from '@mantine/core';
import { useClipboard } from '@mantine/hooks';
import { Check, Link2 } from 'lucide-react';

/* The button is the whole share; the address itself shows only when copying fails, for the player to copy by hand. */
export function GameLink({ address }: Readonly<{ address: string }>) {
  const clipboard = useClipboard();
  const url = new URL(`/play/${address}`, window.location.origin).href;
  return (
    <Stack gap="xs" p="xs" maw={300}>
      <Button variant="light" onClick={() => clipboard.copy(url)}>
        {clipboard.copied ? 'Game link copied' : 'Copy game link'}
      </Button>
      {clipboard.error ? (
        <Text size="xs" role="alert" style={{ overflowWrap: 'anywhere' }}>
          Could not copy. Select and copy this link: {url}
        </Text>
      ) : null}
    </Stack>
  );
}

/** The drafting chip's invitation while seats are still open: one compact button that copies the game link. */
export function InviteLink({ address }: Readonly<{ address: string }>) {
  const clipboard = useClipboard();
  const url = new URL(`/play/${address}`, window.location.origin).href;
  return (
    <Button
      size="compact-sm"
      variant="default"
      leftSection={clipboard.copied ? <Check size={14} aria-hidden /> : <Link2 size={14} aria-hidden />}
      title={clipboard.error ? `Could not copy. Select and copy this link: ${url}` : undefined}
      onClick={() => clipboard.copy(url)}
    >
      {clipboard.copied ? 'Link copied' : 'Copy invite link'}
    </Button>
  );
}
