import { Button, Stack, Text } from '@mantine/core';
import { useClipboard } from '@mantine/hooks';

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
