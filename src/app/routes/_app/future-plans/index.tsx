/* oxlint-disable-next-line no-restricted-imports -- The plans atlas sets its own editorial headings beside the coordinate numbers. */
import { Anchor, Box, Grid, SimpleGrid, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import { createFileRoute, Link } from '@tanstack/react-router';
import { PageTitle } from '@ui/block/PageTitle';
import { Eyebrow } from '@ui/content/Eyebrow';
import { StatusBadge } from '@ui/content/StatusBadge';
import { LabeledAction } from '@ui/control/LabeledAction';
import { AtlasLayout } from '@ui/layout/AtlasLayout';
import { PageLayout } from '@ui/layout/PageLayout';
import { Bullets } from '@ui/list/Bullets';
import { Surface } from '@ui/surface';
import {
  ArrowRight,
  BookOpen,
  ChartNoAxesColumnIncreasing,
  CircleHelp,
  Bot,
  ClipboardCheck,
  Code2,
  Gamepad2,
  Globe,
  GitCompare,
  Layers,
  Languages,
  Hourglass,
  Lightbulb,
  Lock,
  ListChecks,
  MessageCirclePlus,
  PenTool,
  Printer,
  Scissors,
  Search,
  Shuffle,
  Swords,
  Trophy,
  Wrench,
} from 'lucide-react';
import type { ReactNode } from 'react';

import { publicPageHead } from '@app/routes/publicPage';

import styles from './index.module.css';

export const Route = createFileRoute('/_app/future-plans/')({
  ssr: true,
  head: () =>
    publicPageHead({
      name: 'Future plans',
      pathname: '/future-plans',
      description:
        'What Dune Zone could become: Rulebooks made for the web, a Rulebook creator, game results and faction table tools.',
      social: { kind: 'Dune Zone', shape: 'portrait' },
    }),
  component: FuturePlansPage,
});

const GITHUB_REPOSITORY = 'https://github.com/ndelangen/dunezone';
const GITHUB_IDEAS = `${GITHUB_REPOSITORY}/issues/new/choose`;
const GITHUB_BACKLOG = `${GITHUB_REPOSITORY}/issues`;

/** Where a shipped capability lives: a public, indexable page. */
type BuiltAt = '/rulesets' | '/faq' | '/create' | '/play';

type Capability = {
  icon: ReactNode;
  title: string;
  detail: string;
  /** Set once the capability ships: it leaves the atlas and is listed under Completed, linking here. */
  built?: BuiltAt;
};

type FuturePlan = {
  id: string;
  title: string;
  shortTitle: string;
  statement: string;
  icon: ReactNode;
  capabilities: Capability[];
};

const FUTURE_PLANS: FuturePlan[] = [
  {
    id: 'rulebooks',
    title: 'Every rulebook, made for the web',
    shortTitle: 'Read the rules',
    statement: 'Faithful editions of the published rulebooks, made easier to read, search, and compare at the table.',
    icon: <BookOpen />,
    capabilities: [
      { icon: <BookOpen />, title: 'Faithful editions', detail: 'Preserve the books people know.', built: '/rulesets' },
      {
        icon: <Search />,
        title: 'Find an answer',
        detail: 'Search rules without stopping the game.',
        built: '/faq',
      },
      {
        icon: <ListChecks />,
        title: 'Compare editions',
        detail: 'See which rule belongs to which game.',
        built: '/rulesets',
      },
      {
        icon: <MessageCirclePlus />,
        title: 'Ask the community',
        detail: 'Ask and answer rules questions in public, for each ruleset.',
        built: '/faq',
      },
    ],
  },
  {
    id: 'rulesets',
    title: 'Every way the game is played',
    shortTitle: 'More rulesets',
    statement: 'Tournament rules, official answers and council rulings, kept beside the rulebooks they change.',
    icon: <ListChecks />,
    capabilities: [
      { icon: <Trophy />, title: 'WBC ruleset', detail: 'The tournament rules, ready to read.' },
      {
        icon: <CircleHelp />,
        title: 'The GF9 FAQ',
        detail: 'Hundreds of official answers, searchable.',
      },
      {
        icon: <GitCompare />,
        title: 'What changed',
        detail: 'Highlight the edits between two editions.',
      },
    ],
  },
  {
    id: 'create',
    title: 'Create the version you wish existed',
    shortTitle: 'Create and publish',
    statement: 'Build a rulebook and its pieces together, then take the finished game wherever your group plays.',
    icon: <PenTool />,
    capabilities: [
      {
        icon: <PenTool />,
        title: 'Rulebook creator',
        detail: 'Write and arrange rules on the web.',
        built: '/create',
      },
      {
        icon: <Printer />,
        title: 'Print and PDF',
        detail: 'Bring a finished edition to the table.',
        built: '/rulesets',
      },
      {
        icon: <Gamepad2 />,
        title: 'Tabletop Simulator',
        detail: 'Export the same work for online play.',
      },
      {
        icon: <Scissors />,
        title: 'Print-and-play decks',
        detail: 'Any deck, cut-ready, backs lined up.',
      },
      {
        icon: <Printer />,
        title: 'Faction print kit',
        detail: 'Sheet, shield and tokens on a home printer.',
      },
    ],
  },
  {
    id: 'results',
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
        built: '/play',
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
    id: 'tools',
    title: 'Give every faction its perfect table tool',
    shortTitle: 'Build better tools',
    statement: 'Start with the best possible Atreides card tracker, then keep making the small tools players ask for.',
    icon: <Wrench />,
    capabilities: [
      {
        icon: <ListChecks />,
        title: 'Atreides tracker',
        detail: 'Know which Treachery cards remain.',
      },
      {
        icon: <Layers />,
        title: 'Spice deck tracker',
        detail: 'Know which Spice cards are left to blow.',
      },
      {
        icon: <Swords />,
        title: 'Battle calculator',
        detail: 'See who wins before the plans are revealed.',
      },
      {
        icon: <Shuffle />,
        title: 'Faction draft',
        detail: 'Deal or draft factions fairly on one phone.',
      },
      {
        icon: <ClipboardCheck />,
        title: 'Setup checklist',
        detail: 'Every step and starting position for your factions.',
      },
      {
        icon: <Hourglass />,
        title: 'Round tracker',
        detail: 'Turn, phase and what each faction can do now.',
      },
      {
        icon: <Lock />,
        title: 'Prediction keeper',
        detail: 'Seal a prediction until the game is won.',
      },
      {
        icon: <Lightbulb />,
        title: 'Whatever comes next',
        detail: 'Let players propose the next useful tool.',
      },
    ],
  },
  {
    id: 'everyone',
    title: 'Bring more people to the table',
    shortTitle: 'Open the table',
    statement: 'Bots that can take an empty seat in Play, and Dune Zone in more languages than English.',
    icon: <Globe />,
    capabilities: [
      { icon: <Bot />, title: 'Bot opponents', detail: 'Fill an empty seat with an AI faction.' },
      { icon: <Languages />, title: 'Your language', detail: 'The whole interface, translated.' },
    ],
  },
];

/**
 * A theme stays in the atlas while any of its capabilities is still to come, numbered in the order that remains.
 * Shipped capabilities move to Completed instead of being deleted, so their wording stays on the page.
 */
const PLANNED = FUTURE_PLANS.flatMap((plan) => {
  const capabilities = plan.capabilities.filter((capability) => !capability.built);
  return capabilities.length === 0 ? [] : [{ ...plan, capabilities }];
}).map((plan, index) => ({ ...plan, number: String(index + 1).padStart(2, '0') }));

/** Every theme with a shipped capability; `whole` when nothing of it is left to build, so its statement moves too. */
const COMPLETED = FUTURE_PLANS.flatMap((plan) => {
  const capabilities = plan.capabilities.filter((capability) => capability.built);
  return capabilities.length === 0
    ? []
    : [{ ...plan, capabilities, whole: capabilities.length === plan.capabilities.length }];
});

function FuturePlansPage() {
  return (
    <PageLayout>
      <PageLayout.Header size="hero">
        <Stack gap="md" miw={0} align="center" ta="center">
          <PageTitle
            title="Future plans"
            subtitle="What Dune Zone could become"
            lede="These are promises, not release dates. Explore the territory, then tell us where we should go next."
          />
        </Stack>
      </PageLayout.Header>
      <PageLayout.Content>
        <AtlasLayout className={styles.atlasFrame}>
          <AtlasLayout.Sidebar>
            <Stack component="aside" gap="md">
              <Box w="fit-content">
                <StatusBadge>All planned</StatusBadge>
              </Box>
              <Eyebrow>The territory</Eyebrow>
              <nav aria-label="Future plan themes">
                <Bullets gap="none">
                  {PLANNED.map((plan) => (
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
              {PLANNED.map((plan) => (
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

              <Surface as="section" aria-label="Contribute to Dune Zone" padding="xl" className={styles.contribution}>
                <SimpleGrid cols={{ base: 1, md: 3 }} spacing="xl" verticalSpacing="xl">
                  <ThemeIcon size={72} radius="50%" variant="light" color="dune" aria-hidden>
                    <Lightbulb />
                  </ThemeIcon>
                  <Stack gap="xs">
                    <Eyebrow tone="accent">And more…</Eyebrow>
                    <Title order={2}>Put a new destination on the map</Title>
                    <Text c="dimmed">
                      Open an idea for the community to discuss, or pick up an issue and help build the route there.
                    </Text>
                  </Stack>
                  <Stack justify="center" gap="sm">
                    <LabeledAction
                      emphasis="strong"
                      icon={<MessageCirclePlus size={17} />}
                      href={GITHUB_IDEAS}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Suggest an idea
                    </LabeledAction>
                    <LabeledAction
                      emphasis="strong"
                      intent="positive"
                      icon={<Code2 size={17} />}
                      href={GITHUB_REPOSITORY}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Help build Dune Zone
                    </LabeledAction>
                  </Stack>
                </SimpleGrid>
              </Surface>

              <CompletedPlans />
            </Stack>
          </AtlasLayout.Content>
        </AtlasLayout>
      </PageLayout.Content>
    </PageLayout>
  );
}

/** The shipped part of the plans, kept small at the bottom: each item links to where it now lives. */
function CompletedPlans() {
  return (
    <Stack component="section" aria-labelledby="completed-plans" gap="lg" className={styles.completed}>
      <Box w="fit-content">
        <StatusBadge tone="positive">Completed</StatusBadge>
      </Box>
      <Title order={2} id="completed-plans" className={styles.completedTitle}>
        Already built
      </Title>
      {COMPLETED.map((plan) => (
        <Stack component="article" gap="sm" key={plan.id}>
          <Title order={3} className={styles.completedTheme}>
            {plan.whole ? plan.title : plan.shortTitle}
          </Title>
          {plan.whole ? (
            <Text size="sm" c="dimmed">
              {plan.statement}
            </Text>
          ) : null}
          <Bullets columns={{ base: 1, sm: 3 }}>
            {plan.capabilities.map((capability) => (
              <Bullets.Item
                key={capability.title}
                icon={capability.icon}
                title={capability.title}
                detail={capability.detail}
                renderLink={(content) => (
                  <Anchor component={Link} to={capability.built} c="inherit" underline="never">
                    {content}
                  </Anchor>
                )}
              />
            ))}
          </Bullets>
        </Stack>
      ))}
    </Stack>
  );
}
