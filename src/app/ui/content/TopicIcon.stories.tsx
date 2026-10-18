import { SimpleGrid, Stack, Text } from '@mantine/core';
import preview from '@sb/preview';
import { expect } from 'storybook/test';

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

/** Both kinds take the surrounding text colour: a lucide glyph strokes with it, and a mask topic fills with it. */
export const InheritedColor = meta.story({
  args: { topic: 'identity', size: 48 },
  render: (args) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 24, color: '#c2410c' }}>
      <TopicIcon {...args} />
      <TopicIcon topic="face" size={args.size} />
      <TopicIcon topic="battle" size={args.size} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const inherited = 'rgb(194, 65, 12)';
    const icons = [...canvasElement.querySelectorAll('svg')];
    await expect(icons).toHaveLength(2);
    /* What a lucide glyph paints is its paths' stroke, not the colour property they all inherit anyway. */
    for (const icon of icons) {
      const paths = [...icon.querySelectorAll('path, circle, rect, line, polyline')];
      await expect(paths.length).toBeGreaterThan(0);
      await expect(paths.map((path) => getComputedStyle(path).stroke)).toEqual(paths.map(() => inherited));
    }
    /* A mask topic paints its background through the mask, so that is the colour to check. */
    const masks = [...canvasElement.querySelectorAll<HTMLElement>('span[aria-hidden]')];
    await expect(masks).toHaveLength(1);
    await expect(getComputedStyle(masks[0]!).backgroundColor).toBe(inherited);
  },
});
