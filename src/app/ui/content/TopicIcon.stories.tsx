import { SimpleGrid, Stack, Text } from '@mantine/core';
import preview from '@sb/preview';

import { TOPIC_ICON_TOPICS, TopicIcon } from './TopicIcon';

const meta = preview.meta({
  component: TopicIcon,
  parameters: {
    layout: 'centered',
  },
  args: {
    topic: 'identity',
    size: 32,
  },
});

export const Default = meta.story({
  args: { topic: 'identity' },
});

export const Catalogue = meta.story({
  args: { topic: 'identity' },
  render: (args) => (
    <SimpleGrid cols={{ base: 2, sm: 4, md: 7 }} spacing="xl">
      {TOPIC_ICON_TOPICS.map((topic) => (
        <Stack key={topic} align="center" gap="xs">
          <TopicIcon {...args} topic={topic} />
          <Text size="sm" tt="capitalize">
            {topic}
          </Text>
        </Stack>
      ))}
    </SimpleGrid>
  ),
});

export const InheritedColor = meta.story({
  args: { topic: 'identity', size: 48 },
  render: (args) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 24, color: '#c2410c' }}>
      <TopicIcon {...args} />
      <TopicIcon topic="face" size={args.size} />
    </div>
  ),
});
