import {
  Alert,
  Anchor,
  Avatar,
  Badge,
  Box,
  Button,
  Group,
  Loader,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { createFileRoute, Link } from '@tanstack/react-router';
import type { ErrorComponentProps } from '@tanstack/react-router';
import { ArrowRight, BookOpen, ExternalLink, MessageCircle, Printer, Trophy } from 'lucide-react';

import { loadHomepage, useHomepage } from '@db/homepage';
import { AnimatedLeaderToken } from '@app/components/factions/AnimatedLeaderToken';
import { CreateFactionCta } from '@app/components/factions/CreateFactionCta';
import { formatFactionCatalogueDate } from '@app/components/factions/factionCatalogueDate';
import { FactionCatalogueSpotlight } from '@app/components/factions/FactionCatalogueSpotlight';
import { FuturePlanItem } from '@app/components/future/FuturePlanItem';
import { AsymmetricSplitLayout } from '@app/components/layout/AsymmetricSplitLayout';
import { TriptychLayout } from '@app/components/layout/TriptychLayout';
import { PageLayout } from '@app/components/shell';

import styles from './index.module.css';

export const Route = createFileRoute('/_app/')({
  codeSplitGroupings: [['component', 'pendingComponent', 'errorComponent']],
  loader: loadHomepage,
  pendingComponent: HomepagePending,
  errorComponent: HomepageError,
  component: IndexPage,
});

function IndexPage() {
  const loaderData = Route.useLoaderData();
  const homepage = useHomepage({ initialData: loaderData });
  const data = homepage.data;

  if (!data) {
    return <HomepagePending />;
  }

  const counts = data.community.counts;
  const metrics = [
    { value: compactNumber(counts.factions), label: 'factions' },
    { value: compactNumber(counts.rulesets), label: 'rulesets' },
    { value: compactNumber(counts.members), label: 'members' },
    { value: compactNumber(counts.questions), label: 'questions' },
    { value: compactNumber(counts.answers), label: 'answers' },
  ];

  return (
    <PageLayout
      header={
        <Stack className={styles.hero} align="center" justify="center" gap="sm">
          <Text className={styles.heroKicker}>A game of conquest, diplomacy & betrayal</Text>
          <Title order={1} className={styles.heroTitle}>
            Make Dune your own
          </Title>
          <Text className={styles.heroDeck}>
            Discover what people are playing today—or make the thing they play tomorrow.
          </Text>
          <Group justify="center" mt="xs">
            <Button size="sm" renderRoot={(props) => <Link {...props} to="/rulesets" />}>
              Discover the game
            </Button>
            <CreateFactionCta size="sm" withArrow>
              Start creating
            </CreateFactionCta>
          </Group>
        </Stack>
      }
    >
      <Stack gap="xl">
        <TriptychLayout
          className={styles.storyLayout}
          left={
            <Box className={styles.storyColumn}>
              <Stack justify="space-between" h="100%" gap="xl">
                <Box>
                  <Badge color="dune">Start here</Badge>
                  <Title order={2} mt="sm" className={styles.storyTitle}>
                    A game where every player breaks the rules differently
                  </Title>
                  <Text c="dimmed" size="lg" mt="md" className={styles.storyCopy}>
                    Dune turns conquest into conversation. Your strongest weapon may be an alliance,
                    a threat, a promise—or knowing exactly when to betray one.
                  </Text>
                </Box>
                <Group>
                  <Button renderRoot={(props) => <Link {...props} to="/rulesets" />}>
                    Discover Dune
                  </Button>
                  <Button
                    component="a"
                    href="https://treachery.online/"
                    target="_blank"
                    rel="noopener noreferrer"
                    variant="subtle"
                    rightSection={<ExternalLink size={15} aria-hidden />}
                  >
                    Play online
                  </Button>
                </Group>
              </Stack>
            </Box>
          }
          center={<AnimatedLeaderToken />}
          centerClassName={styles.storyPreview}
          right={
            <Box className={styles.storyColumn}>
              <Stack gap="md">
                <Badge color="confirm" w="fit-content">
                  Make it yours
                </Badge>
                <Title order={2}>Your idea belongs at the table</Title>
                <Text c="dimmed">
                  Remix a familiar edition, learn from community homebrew, or invent a faction
                  nobody has seen before. Watch every piece take shape, then preview, print, and
                  share it with friends.
                </Text>
                <Group mt="sm">
                  <CreateFactionCta withArrow>Start creating</CreateFactionCta>
                  <Button
                    variant="subtle"
                    color="confirm"
                    renderRoot={(props) => <Link {...props} to="/factions" />}
                  >
                    Browse homebrew
                  </Button>
                </Group>
              </Stack>
            </Box>
          }
        />

        <Paper
          component="section"
          className={styles.communityBand}
          p={{ base: 'lg', md: 'xl' }}
          radius="lg"
          withBorder
        >
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="xl" verticalSpacing="xl">
            <Stack gap="sm">
              <Text className={styles.kicker}>Built by people around the table</Text>
              <Title order={2}>A living game needs a living community</Title>
              <Text c="dimmed">
                Find the people making factions, answering edge cases, and bringing new players into
                the fold.
              </Text>
            </Stack>
            <Stack gap="md">
              <SimpleGrid cols={{ base: 2, sm: 5 }} spacing="sm">
                {metrics.map((metric) => (
                  <Box key={metric.label}>
                    <Text fw={900} size="xl">
                      {metric.value}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {metric.label}
                    </Text>
                  </Box>
                ))}
              </SimpleGrid>
              <Group justify="space-between" align="center">
                {data.community.newestMembers.length > 0 ? (
                  <Avatar.Group>
                    {data.community.newestMembers.map((member) => (
                      <Link
                        key={member.id}
                        to="/profiles/$profileSlug"
                        params={{ profileSlug: member.slug }}
                        className={styles.avatarLink}
                        aria-label={`View ${member.username} profile`}
                      >
                        <Avatar src={member.avatarUrl} alt={member.username} />
                      </Link>
                    ))}
                  </Avatar.Group>
                ) : (
                  <Text size="sm" c="dimmed">
                    New makers will appear here.
                  </Text>
                )}
                <Button variant="subtle" renderRoot={(props) => <Link {...props} to="/profiles" />}>
                  Meet the community
                </Button>
              </Group>
              <Group gap="xs">
                <Anchor
                  href="https://discord.com/invite/dune-tabletop-624609341886169117"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Discord
                </Anchor>
                <Text c="dimmed">·</Text>
                <Anchor
                  href="https://www.reddit.com/r/DuneBoardGame/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Reddit
                </Anchor>
                <Text c="dimmed">·</Text>
                <Anchor
                  href="https://boardgamegeek.com/boardgame/283355/dune/forums/69"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  BoardGameGeek
                </Anchor>
              </Group>
            </Stack>
          </SimpleGrid>
        </Paper>

        <AsymmetricSplitLayout
          className={styles.discoveryLayout}
          wide={
            <Box className={styles.discoveryColumn}>
              <Stack gap="lg">
                <Group justify="space-between" align="end" wrap="wrap" gap="md">
                  <Box>
                    <Text className={styles.kicker}>From the catalogue</Text>
                    <Title order={2}>New ideas are arriving</Title>
                  </Box>
                  <Anchor component={Link} to="/factions" fw={700} className={styles.headingLink}>
                    See every faction <ArrowRight size={15} aria-hidden />
                  </Anchor>
                </Group>
                <Stack gap="sm">
                  {data.spotlights.newArrival ? (
                    <FactionCatalogueSpotlight
                      faction={data.spotlights.newArrival}
                      label="New arrival"
                      meta={`Created ${formatFactionCatalogueDate(data.spotlights.newArrival.created_at)}`}
                    />
                  ) : null}
                  {data.spotlights.freshlyUpdated ? (
                    <FactionCatalogueSpotlight
                      faction={data.spotlights.freshlyUpdated}
                      label="Freshly updated"
                      meta={`Updated ${formatFactionCatalogueDate(data.spotlights.freshlyUpdated.updated_at)}`}
                    />
                  ) : null}
                  {!data.spotlights.newArrival && !data.spotlights.freshlyUpdated ? (
                    <Text c="dimmed">The catalogue is waiting for its first faction.</Text>
                  ) : null}
                </Stack>
              </Stack>
            </Box>
          }
          narrow={
            <Box className={styles.discoveryColumn}>
              <Stack gap="lg">
                <Group justify="space-between" align="end" wrap="wrap" gap="md">
                  <Box>
                    <Badge color="gray" variant="filled">
                      Planned
                    </Badge>
                    <Title order={2} mt="xs">
                      What we’ll make next
                    </Title>
                  </Box>
                  <Anchor
                    component={Link}
                    to="/future-plans"
                    fw={700}
                    className={styles.headingLink}
                  >
                    Future plans <ArrowRight size={15} aria-hidden />
                  </Anchor>
                </Group>
                <Stack gap="md">
                  <FuturePlanItem icon={<BookOpen size={20} />}>
                    Web-native rulebooks
                  </FuturePlanItem>
                  <FuturePlanItem icon={<Printer size={20} />}>PDF and TTS output</FuturePlanItem>
                  <FuturePlanItem icon={<Trophy size={20} />}>
                    Results and leaderboards
                  </FuturePlanItem>
                  <FuturePlanItem icon={<MessageCircle size={20} />}>
                    An Atreides card tracker
                  </FuturePlanItem>
                  <Anchor component={Link} to="/future-plans" fw={700}>
                    What should we make after that?
                  </Anchor>
                </Stack>
              </Stack>
            </Box>
          }
        />
      </Stack>
    </PageLayout>
  );
}

function HomepagePending() {
  return (
    <PageLayout header={<Title order={1}>Make Dune your own</Title>}>
      <Paper p="xl" withBorder radius="md" aria-live="polite">
        <Stack align="center" gap="sm">
          <Loader size="sm" />
          <Title order={2}>Setting the table</Title>
          <Text c="dimmed">The latest work from the community is loading.</Text>
        </Stack>
      </Paper>
    </PageLayout>
  );
}

function HomepageError({ error }: ErrorComponentProps) {
  return (
    <PageLayout header={<Title order={1}>Make Dune your own</Title>}>
      <Alert color="red" title="The homepage could not be loaded" role="alert">
        <Text size="sm">{error.message || 'An unexpected error occurred.'}</Text>
      </Alert>
    </PageLayout>
  );
}

function compactNumber(value: number) {
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(
    value
  );
}
