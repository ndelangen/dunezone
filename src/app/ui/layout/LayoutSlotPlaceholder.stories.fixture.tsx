import { Center, Text } from '@mantine/core';

export function LayoutSlotPlaceholder({ name, minHeight = 240 }: { name: string; minHeight?: number }) {
  return (
    <Center
      bg="gray.1"
      c="dimmed"
      h="100%"
      mih={minHeight}
      p="md"
      w="100%"
      style={{ borderRadius: 'var(--mantine-radius-md)' }}
    >
      <Text ta="center" fw={700} size="sm">
        {name}
      </Text>
    </Center>
  );
}
