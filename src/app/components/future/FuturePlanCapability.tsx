import { Group, Stack, Text, ThemeIcon } from '@mantine/core';
import type { ReactNode } from 'react';

export function FuturePlanCapability({
  icon,
  title,
  detail,
}: {
  icon: ReactNode;
  title: string;
  detail: string;
}) {
  return (
    <Group wrap="nowrap" align="flex-start" gap="sm">
      <ThemeIcon variant="light" radius="xl" size="lg" aria-hidden>
        {icon}
      </ThemeIcon>
      <Stack gap={1} miw={0}>
        <Text fw={700}>{title}</Text>
        <Text size="sm" c="dimmed">
          {detail}
        </Text>
      </Stack>
    </Group>
  );
}
