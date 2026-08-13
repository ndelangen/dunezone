import {
  Anchor,
  Badge,
  Box,
  Button,
  Grid,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core';
import { createFileRoute } from '@tanstack/react-router';
import { Eyebrow } from '@ui/content/Eyebrow';
import { AtlasLayout } from '@ui/layout/AtlasLayout';
import { PageLayout } from '@ui/layout/PageLayout';
import { Bullets } from '@ui/list/Bullets';
import {
  ArrowRight,
  BookOpen,
  ChartNoAxesColumnIncreasing,
  Code2,
  Gamepad2,
  Lightbulb,
  ListChecks,
  MessageCirclePlus,
  PenTool,
  Printer,
  Search,
  Sparkles,
  Trophy,
  Wrench,
} from 'lucide-react';
import type { ReactNode } from 'react';

import styles from './index.module.css';

export const Route = createFileRoute('/_app/future-plans/')({
  component: FuturePlansPage,
});

const GITHUB_REPOSITORY = 'https://github.com/ndelangen/dunezone';
const GITHUB_IDEAS = `${GITHUB_REPOSITORY}/issues/new/choose`;
const GITHUB_BACKLOG = `${GITHUB_REPOSITORY}/issues`;

type FuturePlan = {
  number: string;
  title: string;
  shortTitle: string;
  statement: string;
  icon: ReactNode;
  capabilities: Array<{ icon: ReactNode; title: string; detail: string }>;
};

const FUTURE_PLANS: FuturePlan[] = [
  {
    number: '01',
    title: 'Every rulebook, made for the web',
    shortTitle: 'Read the rules',
    statement:
      'Faithful editions of the published rulebooks, made easier to read, search, and compare at the table.',
    icon: <BookOpen />,
    capabilities: [
      { icon: <BookOpen />, title: 'Faithful editions', detail: 'Preserve the books people know.' },
      {
        icon: <Search />,
        title: 'Find an answer',
        detail: 'Search rules without stopping the game.',
      },
      {
        icon: <ListChecks />,
        title: 'Compare editions',
        detail: 'See which rule belongs to which game.',
      },
    ],
  },
  {
    number: '02',
    title: 'Create the version you wish existed',
    shortTitle: 'Create and publish',
    statement:
      'Build a rulebook and its pieces together, then take the finished game wherever your group plays.',
    icon: <PenTool />,
    capabilities: [
      {
        icon: <PenTool />,
        title: 'Rulebook creator',
        detail: 'Write and arrange rules on the web.',
      },
      {
        icon: <Printer />,
        title: 'Print and PDF',
        detail: 'Bring a finished edition to the table.',
      },
      {
        icon: <Gamepad2 />,
        title: 'Tabletop Simulator',
        detail: 'Export the same work for online play.',
      },
    ],
  },
  {
    number: '03',
    title: 'Let every game add to the story',
    shortTitle: 'Record the game',
    statement:
      'Report results and turn thousands of plays into a living picture of factions, players, and the metagame.',
    icon: <Trophy />,
    capabilities: [
      {
        icon: <ListChecks />,
        title: 'Report results',
        detail: 'Capture what happened after the game.',
      },
      {
        icon: <ChartNoAxesColumnIncreasing />,
        title: 'Faction win rates',
        detail: 'Learn how every faction performs.',
      },
      { icon: <Trophy />, title: 'Leaderboards', detail: 'Celebrate who plays—and wins—the most.' },
    ],
  },
  {
    number: '04',
    title: 'Give every faction its perfect table tool',
    shortTitle: 'Build better tools',
    statement:
      'Start with the best possible Atreides card tracker, then keep making the small tools players ask for.',
    icon: <Wrench />,
    capabilities: [
      {
        icon: <ListChecks />,
        title: 'Atreides tracker',
        detail: 'Know which Treachery cards remain.',
      },
      {
        icon: <Sparkles />,
        title: 'Ruleset-aware',
        detail: 'Use the exact factions and cards in play.',
      },
      {
        icon: <Lightbulb />,
        title: 'Whatever comes next',
        detail: 'Let players propose the next useful tool.',
      },
    ],
  },
];

function FuturePlansPage() {
  return (
    <PageLayout>
      <PageLayout.Header>
        <SimpleGrid className={styles.hero} cols={{ base: 1, md: 2 }} spacing="xl">
          <Stack gap="xs">
            <Eyebrow tone="inverse">Our ambitions</Eyebrow>
            <Title order={1}>A map of what Dune Zone could become</Title>
          </Stack>
          <Text size="lg">
            These are promises, not release dates. Explore the territory, then tell us where we
            should go next.
          </Text>
        </SimpleGrid>
      </PageLayout.Header>
      <PageLayout.Content>
        <AtlasLayout className={styles.atlasFrame}>
          <AtlasLayout.Sidebar className={styles.atlasSidebar}>
            <Stack component="aside" gap="md">
              <Badge color="gray" variant="filled" w="fit-content">
                All planned
              </Badge>
              <Eyebrow>The territory</Eyebrow>
              <nav aria-label="Future plan themes">
                <Bullets gap="none">
                  {FUTURE_PLANS.map((plan) => (
                    <Bullets.Item
                      key={plan.number}
                      icon={plan.icon}
                      title={plan.shortTitle}
                      trailing={<ArrowRight size={16} aria-hidden />}
                      renderLink={(content) => (
                        <Anchor className={styles.indexLink} href={`#atlas-${plan.number}`}>
                          {content}
                        </Anchor>
                      )}
                    />
                  ))}
                </Bullets>
              </nav>
              <Anchor href={GITHUB_BACKLOG} target="_blank" rel="noopener noreferrer" fw={700}>
                Follow the development backlog <ArrowRight size={15} aria-hidden />
              </Anchor>
            </Stack>
          </AtlasLayout.Sidebar>
          <AtlasLayout.Content>
            <Stack gap={0}>
              {FUTURE_PLANS.map((plan) => (
                <Stack
                  component="article"
                  id={`atlas-${plan.number}`}
                  className={styles.entry}
                  gap="xl"
                  key={plan.number}
                >
                  <Grid gap="lg" align="flex-start">
                    <Grid.Col span={{ base: 12, sm: 2 }}>
                      <Text className={styles.coordinate}>{plan.number}</Text>
                    </Grid.Col>
                    <Grid.Col span={{ base: 12, sm: 10 }}>
                      <Eyebrow tone="accent">Planned territory</Eyebrow>
                      <Title order={2}>{plan.title}</Title>
                      <Text className={styles.statement} c="dimmed" mt="sm">
                        {plan.statement}
                      </Text>
                    </Grid.Col>
                  </Grid>
                  <Box ml={{ base: 0, sm: '16.6667%' }}>
                    <Bullets gap="xl" columns={{ base: 1, sm: 3 }}>
                      {plan.capabilities.map((capability) => (
                        <Bullets.Item
                          key={capability.title}
                          icon={capability.icon}
                          title={capability.title}
                          detail={capability.detail}
                        />
                      ))}
                    </Bullets>
                  </Box>
                </Stack>
              ))}

              <Paper
                component="section"
                className={styles.contribution}
                radius="lg"
                p={{ base: 'xl', md: 48 }}
              >
                <SimpleGrid cols={{ base: 1, md: 3 }} spacing="xl" verticalSpacing="xl">
                  <ThemeIcon size={72} radius="50%" variant="light" color="dune" aria-hidden>
                    <Lightbulb />
                  </ThemeIcon>
                  <Stack gap="xs">
                    <Eyebrow tone="accent">And more…</Eyebrow>
                    <Title order={2}>Put a new destination on the map</Title>
                    <Text c="dimmed">
                      Open an idea for the community to discuss, or pick up an issue and help build
                      the route there.
                    </Text>
                  </Stack>
                  <Stack justify="center" gap="sm">
                    <Button
                      component="a"
                      href={GITHUB_IDEAS}
                      target="_blank"
                      rel="noopener noreferrer"
                      leftSection={<MessageCirclePlus size={17} aria-hidden />}
                    >
                      Suggest an idea
                    </Button>
                    <Button
                      component="a"
                      href={GITHUB_REPOSITORY}
                      target="_blank"
                      rel="noopener noreferrer"
                      color="confirm"
                      leftSection={<Code2 size={17} aria-hidden />}
                    >
                      Help build Dune Zone
                    </Button>
                  </Stack>
                </SimpleGrid>
              </Paper>
            </Stack>
          </AtlasLayout.Content>
        </AtlasLayout>
      </PageLayout.Content>
    </PageLayout>
  );
}
