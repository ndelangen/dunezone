import { Center, Stack, Text } from '@mantine/core';
import type { ReactNode } from 'react';

export function LayoutStoryFrame({ children, width }: { children: ReactNode; width: number }) {
  return <div style={{ marginInline: 'auto', maxWidth: '100%', width }}>{children}</div>;
}

export function LayoutStoryCase({
  children,
  label,
  width,
}: {
  children: ReactNode;
  label: string;
  width: number;
}) {
  return (
    <LayoutStoryFrame width={width}>
      <Stack gap="xs">
        <Text c="dimmed" fw={700} size="sm">
          {label} · {width}px
        </Text>
        {children}
      </Stack>
    </LayoutStoryFrame>
  );
}

export function LayoutSlotPlaceholder({
  name,
  minHeight = 240,
}: {
  name: string;
  minHeight?: number;
}) {
  return (
    <Center
      bg="gray.1"
      c="dimmed"
      h="100%"
      mih={minHeight}
      p="md"
      style={{ borderRadius: 'var(--mantine-radius-md)' }}
    >
      <Text ta="center" fw={700} size="sm">
        {name}
      </Text>
    </Center>
  );
}
