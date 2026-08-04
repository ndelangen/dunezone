import { Badge, Box, Paper, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import preview from '@sb/preview';
import { Sparkles } from 'lucide-react';

import { HomepageStoryLayout } from './HomepageStoryLayout';

const meta = preview.meta({
  component: HomepageStoryLayout,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Balances the homepage play invitation, animated asset preview, and homebrew invitation. The regions stack at constrained widths.',
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
    play: (
      <Paper p="xl" radius="lg" withBorder h="100%">
        <Stack gap="md">
          <Badge color="dune" w="fit-content">
            Start here
          </Badge>
          <Title order={2}>Every player breaks the rules differently</Title>
          <Text c="dimmed">
            Discover the deals, threats, and betrayals that make Dune memorable.
          </Text>
        </Stack>
      </Paper>
    ),
    preview: (
      <ThemeIcon size={180} radius={180} variant="light" color="confirm" aria-label="Asset preview">
        <Sparkles size={72} />
      </ThemeIcon>
    ),
    create: (
      <Paper p="xl" radius="lg" withBorder h="100%">
        <Stack gap="md">
          <Badge color="confirm" w="fit-content">
            Make it yours
          </Badge>
          <Title order={2}>Your idea belongs at the table</Title>
          <Text c="dimmed">Remix a familiar edition or create a faction nobody has seen.</Text>
        </Stack>
      </Paper>
    ),
  },
  argTypes: {
    play: { control: false },
    preview: { control: false },
    create: { control: false },
  },
});

export const Desktop = meta.story({
  globals: { viewport: { value: 'appDesktop' } },
});

export const Mobile = meta.story({
  globals: { viewport: { value: 'appMobile' } },
});
