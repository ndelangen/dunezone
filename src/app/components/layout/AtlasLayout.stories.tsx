import { Anchor, Box, NavLink, Paper, Stack, Text, Title } from '@mantine/core';
import preview from '@sb/preview';
import { BookOpen, Trophy, Wrench } from 'lucide-react';

import { AtlasLayout } from './AtlasLayout';

const meta = preview.meta({
  component: AtlasLayout,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Keeps the Future plans territory index visible beside the ambition content on wide screens and moves it into document flow on compact screens.',
      },
    },
  },
  decorators: [
    (Story) => (
      <Box p={{ base: 'md', md: 'xl' }} bg="var(--mantine-color-gray-0)" mih="100vh">
        <Story />
      </Box>
    ),
  ],
  args: {
    index: (
      <Paper p="md" radius="lg" withBorder>
        <Stack gap="xs">
          <Text tt="uppercase" size="xs" fw={800} c="dimmed">
            The territory
          </Text>
          <NavLink href="#rules" label="Read the rules" leftSection={<BookOpen size={18} />} />
          <NavLink href="#results" label="Record the game" leftSection={<Trophy size={18} />} />
          <NavLink href="#tools" label="Build better tools" leftSection={<Wrench size={18} />} />
          <Anchor href="https://github.com/ndelangen/dunezone/issues" mt="sm">
            Follow the backlog
          </Anchor>
        </Stack>
      </Paper>
    ),
    children: (
      <Stack gap="xl">
        {[
          ['rules', '01', 'Every rulebook, made for the web'],
          ['results', '02', 'Let every game add to the story'],
          ['tools', '03', 'Give every faction its perfect table tool'],
        ].map(([id, number, title]) => (
          <Paper key={id} id={id} p="xl" radius="lg" withBorder mih={220}>
            <Text c="dune.8" fw={900} size="xl">
              {number}
            </Text>
            <Title order={2} mt="sm">
              {title}
            </Title>
            <Text c="dimmed" mt="md">
              Planned territory—an ambition without a promised delivery date.
            </Text>
          </Paper>
        ))}
      </Stack>
    ),
  },
  argTypes: {
    index: { control: false },
    children: { control: false },
  },
});

export const DesktopStickyIndex = meta.story({
  globals: { viewport: { value: 'appDesktop' } },
});

export const MobileStack = meta.story({
  globals: { viewport: { value: 'appMobile' } },
});
