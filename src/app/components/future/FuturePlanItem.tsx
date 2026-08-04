import { Group, Text, ThemeIcon } from '@mantine/core';
import type { ReactNode } from 'react';

export function FuturePlanItem({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <Group wrap="nowrap" align="center" gap="sm">
      <ThemeIcon variant="light" radius="xl" size="lg" aria-hidden>
        {icon}
      </ThemeIcon>
      <Text fw={700} size="sm" lh={1.25}>
        {children}
      </Text>
    </Group>
  );
}
