import { Center, Text } from '@mantine/core';

type LayoutSlotPlaceholderTone = 'header' | 'primary' | 'secondary' | 'tertiary' | 'toolbar';

const toneColors: Record<LayoutSlotPlaceholderTone, string> = {
  header: 'blue',
  toolbar: 'violet',
  primary: 'teal',
  secondary: 'orange',
  tertiary: 'pink',
};

export function LayoutSlotPlaceholder({
  name,
  tone,
  minHeight = 240,
}: Readonly<{
  name: string;
  tone: LayoutSlotPlaceholderTone;
  minHeight?: number;
}>) {
  const color = toneColors[tone];

  return (
    <Center
      bg={`${color}.1`}
      c={`${color}.9`}
      h="100%"
      mih={minHeight}
      p="md"
      w="100%"
      style={{
        border: `1px solid var(--mantine-color-${color}-3)`,
        borderRadius: 'var(--mantine-radius-md)',
      }}
    >
      <Text ta="center" fw={700} size="sm">
        {name}
      </Text>
    </Center>
  );
}
