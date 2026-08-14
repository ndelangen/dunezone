import {
  Alert,
  Anchor,
  Avatar,
  Badge,
  Box,
  Button,
  Group,
  Loader,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { createFileRoute, Link } from '@tanstack/react-router';
import type { ErrorComponentProps } from '@tanstack/react-router';
import { FactionCatalogueSpotlight } from '@ui/block/FactionCatalogueSpotlight';
import { Section } from '@ui/block/Section';
import { AnimatedLeaderToken } from '@ui/content/AnimatedLeaderToken';
import { formatFactionCatalogueDate } from '@ui/content/dates';
import { Eyebrow } from '@ui/content/Eyebrow';
import { HeroTitle } from '@ui/content/HeroTitle';
import { CallToAction } from '@ui/control/CallToAction';
import { AsymmetricSplitLayout } from '@ui/layout/AsymmetricSplitLayout';
import { PageLayout } from '@ui/layout/PageLayout';
import { TriptychLayout } from '@ui/layout/TriptychLayout';
import { Bullets } from '@ui/list/Bullets';
import { Surface } from '@ui/surface';
import { ArrowRight, BookOpen, ExternalLink, MessageCircle, Printer, Trophy } from 'lucide-react';

import { loadHomepage, useHomepage } from '@db/homepage';

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
    <PageLayout>
      <PageLayout.Header>
        <Stack className={styles.hero} align="center" justify="center" gap="sm">
          <Eyebrow tone="inverse">A game of conquest, diplomacy &amp; betrayal</Eyebrow>
          <HeroTitle>Make Dune your own</HeroTitle>
          <Text className={styles.heroDeck}>
            Discover what people are playing today—or make the thing they play tomorrow.
          </Text>
          <Group justify="center" mt="xs">
            <Button size="sm" renderRoot={(props) => <Link {...props} to="/rulesets" />}>
              Discover the game
            </Button>
            <CallToAction
              size="sm"
              direction="forward"
              renderRoot={(rootProps) => <Link {...rootProps} to="/factions/create" />}
            >
              Start creating
            </CallToAction>
          </Group>
        </Stack>
      </PageLayout.Header>
      <PageLayout.Content>
        <Stack gap="xl">
          <TriptychLayout className={styles.storyLayout}>
            <TriptychLayout.Left>
              <Box className={styles.storyColumn}>
                <Stack justify="space-between" h="100%" gap="xl">
                  <Box>
                    <Badge color="dune">Start here</Badge>
                    <Title order={2} mt="sm" className={styles.storyTitle}>
                      A game where every player breaks the rules differently
                    </Title>
                    <Text c="dimmed" size="lg" mt="md" className={styles.storyCopy}>
                      Dune turns conquest into conversation. Your strongest weapon may be an
                      alliance, a threat, a promise—or knowing exactly when to betray one.
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
            </TriptychLayout.Left>
            <TriptychLayout.Center className={styles.storyPreview}>
              <AnimatedLeaderToken />
            </TriptychLayout.Center>
            <TriptychLayout.Right>
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
                    <CallToAction
                      direction="forward"
                      renderRoot={(rootProps) => <Link {...rootProps} to="/factions/create" />}
                    >
                      Start creating
                    </CallToAction>
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
            </TriptychLayout.Right>
          </TriptychLayout>

          <Surface className={styles.communityBand}>
            <SimpleGrid cols={{ base: 1, md: 2 }} spacing="xl" verticalSpacing="xl">
              <Stack gap="sm">
                <Eyebrow tone="accent">Built by people around the table</Eyebrow>
                <Title order={2}>A living game needs a living community</Title>
                <Text c="dimmed">
                  Find the people making factions, answering edge cases, and bringing new players
                  into the fold.
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
                  <Button
                    variant="subtle"
                    renderRoot={(props) => <Link {...props} to="/profiles" />}
                  >
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
          </Surface>

          <AsymmetricSplitLayout className={styles.discoveryLayout}>
            <AsymmetricSplitLayout.Wide>
              <Section
                className={styles.discoveryColumn}
                eyebrow="From the catalogue"
                title="New ideas are arriving"
                action={
                  <Anchor component={Link} to="/factions" fw={700} className={styles.headingLink}>
                    See every faction <ArrowRight size={15} aria-hidden />
                  </Anchor>
                }
              >
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
              </Section>
            </AsymmetricSplitLayout.Wide>
            <AsymmetricSplitLayout.Narrow>
              <Section
                className={styles.discoveryColumn}
                eyebrow="Planned"
                title="What we’ll make next"
                action={
                  <Anchor
                    component={Link}
                    to="/future-plans"
                    fw={700}
                    className={styles.headingLink}
                  >
                    Future plans <ArrowRight size={15} aria-hidden />
                  </Anchor>
                }
              >
                <Stack gap="md">
                  <Bullets>
                    <Bullets.Item icon={<BookOpen size={20} />} title="Web-native rulebooks" />
                    <Bullets.Item icon={<Printer size={20} />} title="PDF and TTS output" />
                    <Bullets.Item icon={<Trophy size={20} />} title="Results and leaderboards" />
                    <Bullets.Item
                      icon={<MessageCircle size={20} />}
                      title="An Atreides card tracker"
                    />
                  </Bullets>
                  <Anchor component={Link} to="/future-plans" fw={700}>
                    What should we make after that?
                  </Anchor>
                </Stack>
              </Section>
            </AsymmetricSplitLayout.Narrow>
          </AsymmetricSplitLayout>
        </Stack>
      </PageLayout.Content>
    </PageLayout>
  );
}

function HomepagePending() {
  return (
    <PageLayout>
      <PageLayout.Header>
        <Title order={1}>Make Dune your own</Title>
      </PageLayout.Header>
      <PageLayout.Content>
        <Surface>
          <Stack align="center" gap="sm">
            <Loader size="sm" />
            <Title order={2}>Setting the table</Title>
            <Text c="dimmed">The latest work from the community is loading.</Text>
          </Stack>
        </Surface>
      </PageLayout.Content>
    </PageLayout>
  );
}

function HomepageError({ error }: ErrorComponentProps) {
  return (
    <PageLayout>
      <PageLayout.Header>
        <Title order={1}>Make Dune your own</Title>
      </PageLayout.Header>
      <PageLayout.Content>
        <Alert color="red" title="The homepage could not be loaded" role="alert">
          <Text size="sm">{error.message || 'An unexpected error occurred.'}</Text>
        </Alert>
      </PageLayout.Content>
    </PageLayout>
  );
}

function compactNumber(value: number) {
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(
    value
  );
}
