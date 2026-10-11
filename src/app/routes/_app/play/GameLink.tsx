import { Button, Stack, Text } from '@mantine/core';
import { useClipboard } from '@mantine/hooks';

export function GameLink({ address }: Readonly<{ address: string }>) {
  const clipboard = useClipboard();
  const url = new URL(`/play/${address}`, window.location.origin).href;
  return (
    <Stack gap="xs" p="xs" maw={300}>
      <Text size="xs" style={{ overflowWrap: 'anywhere' }}>
        {url}
      </Text>
      <Button variant="light" onClick={() => clipboard.copy(url)}>
        {clipboard.copied ? 'Game link copied' : 'Copy game link'}
      </Button>
      {clipboard.error ? (
        <Text size="xs" role="alert">
          Could not copy. Select and copy the link above.
        </Text>
      ) : null}
    </Stack>
  );
}
