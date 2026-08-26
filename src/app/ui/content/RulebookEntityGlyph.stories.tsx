import { Group, Stack, Text } from '@mantine/core';
import preview from '@sb/preview';
import { Surface } from '@ui/surface';
import { BookOpenText, Columns3, ListTree } from 'lucide-react';
import type { ReactNode } from 'react';

import { RulebookEntityGlyph } from './RulebookEntityGlyph';
import type { RulebookEntityKind } from './RulebookEntityGlyph';

const meta = preview.meta({
  component: RulebookEntityGlyph,
  parameters: {
    layout: 'centered',
  },
  args: {
    kind: 'page',
    icon: <BookOpenText size={18} />,
  },
});

export const Default = meta.story({
  args: {
    kind: 'page',
    icon: <BookOpenText size={18} />,
  },
});

const examples: readonly { kind: RulebookEntityKind; label: string; icon: ReactNode }[] = [
  { kind: 'page', label: 'Page', icon: <BookOpenText size={18} /> },
  { kind: 'slot', label: 'Slot', icon: <Columns3 size={18} /> },
  { kind: 'block', label: 'Block', icon: <ListTree size={18} /> },
];

export const EntityKinds = meta.story({
  render: () => (
    <Surface padding="lg">
      <Group gap="xl" style={{ color: 'var(--mantine-color-gray-0)' }}>
        {examples.map((example) => (
          <Stack key={example.kind} align="center" gap="xs">
            <RulebookEntityGlyph kind={example.kind} icon={example.icon} />
            <Text c="inherit" size="sm">
              {example.label}
            </Text>
          </Stack>
        ))}
      </Group>
    </Surface>
  ),
});
