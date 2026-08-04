import { Badge, Box, Stack, Text, Title } from '@mantine/core';
import preview from '@sb/preview';
import { BookOpen, MessageCircle, Printer, Trophy } from 'lucide-react';

import { FactionCatalogueSpotlight } from '@app/components/factions/FactionCatalogueSpotlight';
import { FuturePlanItem } from '@app/components/future/FuturePlanItem';
import { factionTokenFixtures } from '@game/fixtures/factionTokens';

import { DiscoveryDeskLayout } from './DiscoveryDeskLayout';

const meta = preview.meta({
  component: DiscoveryDeskLayout,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Pairs current catalogue activity with planned work. The unequal desktop columns become one reading column on narrower screens.',
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
    catalogue: (
      <Stack gap="lg">
        <Box>
          <Text tt="uppercase" size="xs" fw={800} c="dune.8">
            From the catalogue
          </Text>
          <Title order={2}>New ideas are arriving</Title>
        </Box>
        <Stack gap="sm">
          <FactionCatalogueSpotlight
            faction={{
              slug: 'house-ecaz',
              data: { name: 'House Ecaz', ...factionTokenFixtures.ecaz },
            }}
            label="New arrival"
            meta="Created Jul 27, 2026"
          />
          <FactionCatalogueSpotlight
            faction={{
              slug: 'house-atreides',
              data: { name: 'House Atreides', ...factionTokenFixtures.atreides },
            }}
            label="Freshly updated"
            meta="Updated Jul 27, 2026"
          />
        </Stack>
      </Stack>
    ),
    future: (
      <Stack gap="lg">
        <Box>
          <Badge color="gray" variant="filled">
            Planned
          </Badge>
          <Title order={2} mt="xs">
            What we’ll make next
          </Title>
        </Box>
        <Stack gap="md">
          <FuturePlanItem icon={<BookOpen size={20} />}>Web-native rulebooks</FuturePlanItem>
          <FuturePlanItem icon={<Printer size={20} />}>PDF and TTS output</FuturePlanItem>
          <FuturePlanItem icon={<Trophy size={20} />}>Results and leaderboards</FuturePlanItem>
          <FuturePlanItem icon={<MessageCircle size={20} />}>
            An Atreides card tracker
          </FuturePlanItem>
        </Stack>
      </Stack>
    ),
  },
  argTypes: {
    catalogue: { control: false },
    future: { control: false },
  },
});

export const Desktop = meta.story({
  globals: { viewport: { value: 'appDesktop' } },
});

export const Mobile = meta.story({
  globals: { viewport: { value: 'appMobile' } },
});
