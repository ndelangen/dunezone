import { Anchor, Avatar, Badge, Box, Button, Group, SimpleGrid, Stack, Text, Title, Tooltip } from '@mantine/core';
import { useReducedMotion } from '@mantine/hooks';
import { createFileRoute, Link } from '@tanstack/react-router';
import type { ErrorComponentProps } from '@tanstack/react-router';
import { FactionCatalogueSpotlight } from '@ui/block/FactionCatalogueSpotlight';
import { LoadError } from '@ui/block/LoadError';
import { LoadPending } from '@ui/block/LoadPending';
import { PageTitle } from '@ui/block/PageTitle';
import { Section } from '@ui/block/Section';
import { formatFactionCatalogueDate } from '@ui/content/dates';
import { Eyebrow } from '@ui/content/Eyebrow';
import { TopicIcon } from '@ui/content/TopicIcon';
import { CallToAction } from '@ui/control/CallToAction';
import { AsymmetricSplitLayout } from '@ui/layout/AsymmetricSplitLayout';
import { PageLayout } from '@ui/layout/PageLayout';
import { TriptychLayout } from '@ui/layout/TriptychLayout';
import { Bullets } from '@ui/list/Bullets';
import { Surface } from '@ui/surface';
import { ArrowRight, ExternalLink, MessageCircle, Printer, Trophy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { FaRedditAlien } from 'react-icons/fa6';
import { SiBoardgamegeek, SiDiscord } from 'react-icons/si';

import { loadHomepage, useHomepage } from '@db/homepage';
import { isStaleClientData } from '@app/db/core/clientBoundary';
import { PageMessage } from '@app/widgets/page-message/PageMessage';
import { LeaderToken } from '@game/assets/faction/leader/Leader';
import { factionTokenFixtures } from '@game/fixtures/factionTokens';

import styles from './index.module.css';

/* Brand logos are drawn edge-to-edge in their viewBox where lucide insets its glyphs by ~2 of 24
   units, so the same nominal size renders them noticeably heavier than the page's other icons.
   This row is sized to sit level with a lucide icon at 22 rather than to that number itself. */
const BRAND_GLYPH = 18;

const communityLinks = [
  {
    href: 'https://discord.com/invite/dune-tabletop-624609341886169117',
    label: 'Dune Discord server',
    Icon: SiDiscord,
  },
  {
    href: 'https://www.reddit.com/r/DuneBoardGame/',
    label: 'r/DuneBoardGame on Reddit',
    Icon: FaRedditAlien,
  },
  {
    href: 'https://boardgamegeek.com/boardgame/283355/dune/forums/69',
    label: 'Dune forums on BoardGameGeek',
    Icon: SiBoardgamegeek,
  },
] as const;

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
      <PageLayout.Header size="hero">
        <Stack className={styles.hero} align="center" justify="center" gap="sm">
          <PageTitle eyebrow="A game of conquest, diplomacy & betrayal" title="Make Dune your own" />
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
                      Dune turns conquest into conversation. Your strongest weapon may be an alliance, a threat, a
                      promise—or knowing exactly when to betray one.
                    </Text>
                  </Box>
                  <Group>
                    <Button renderRoot={(props) => <Link {...props} to="/rulesets" />}>Discover Dune</Button>
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
                    Remix a familiar edition, learn from community homebrew, or invent a faction nobody has seen before.
                    Watch every piece take shape, then preview, print, and share it with friends.
                  </Text>
                  <Group mt="sm">
                    <CallToAction
                      direction="forward"
                      renderRoot={(rootProps) => <Link {...rootProps} to="/factions/create" />}
                    >
                      Start creating
                    </CallToAction>
                    <Button variant="subtle" color="confirm" renderRoot={(props) => <Link {...props} to="/factions" />}>
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
                  Find the people making factions, answering edge cases, and bringing new players into the fold.
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
                <Group gap="md">
                  {communityLinks.map(({ href, label, Icon }) => (
                    <Tooltip key={href} label={label}>
                      <Anchor
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={label}
                        underline="never"
                        className={styles.communityIconLink}
                      >
                        <Icon size={BRAND_GLYPH} aria-hidden />
                      </Anchor>
                    </Tooltip>
                  ))}
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
                  <Anchor component={Link} to="/future-plans" fw={700} className={styles.headingLink}>
                    Future plans <ArrowRight size={15} aria-hidden />
                  </Anchor>
                }
              >
                <Stack gap="md">
                  <Bullets>
                    <Bullets.Item icon={<TopicIcon topic="rules" size={20} />} title="Web-native rulebooks" />
                    <Bullets.Item icon={<Printer size={20} />} title="PDF and TTS output" />
                    <Bullets.Item icon={<Trophy size={20} />} title="Results and leaderboards" />
                    <Bullets.Item icon={<MessageCircle size={20} />} title="An Atreides card tracker" />
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

/* The three portraits and three edits the token cycles through. Baked in because they are this
   page's illustration rather than anyone's data. */
const LEADER_PORTRAITS = [
  '/image/leader/ilya/ecaz.jpg',
  '/image/leader/ilya/hundro.jpg',
  '/image/leader/ilya/korba.png',
] as const;

const LEADER_EDITS = [
  { name: 'Lady Siona', strength: '4', ...factionTokenFixtures.ecaz },
  { name: 'Duke Maros', strength: '2', ...factionTokenFixtures.moritani },
  { name: 'Farok', strength: '5', ...factionTokenFixtures.fremen },
] as const;

type LeaderAnimationPhase = 'hold' | 'transition' | 'typing';

/**
 * A real leader token demonstrating gradual edits while keeping its portrait.
 *
 * It lives here rather than in the kit because it has no membrane to judge a kind at: no props, both data sets baked in, and one page that renders it.
 */
function AnimatedLeaderToken() {
  const reduceMotion = useReducedMotion();
  const [portrait, setPortrait] = useState<(typeof LEADER_PORTRAITS)[number]>(LEADER_PORTRAITS[0]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [previousIndex, setPreviousIndex] = useState<number | null>(null);
  const [phase, setPhase] = useState<LeaderAnimationPhase>('hold');
  const [typedLength, setTypedLength] = useState(LEADER_EDITS[0].name.length);
  const leader = LEADER_EDITS[currentIndex];

  useEffect(() => {
    setPortrait(LEADER_PORTRAITS[Math.floor(Math.random() * LEADER_PORTRAITS.length)]);
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      return;
    }

    let delay = 1800;
    const advance = () => {
      if (phase === 'hold') {
        setPreviousIndex(currentIndex);
        setCurrentIndex((current) => (current + 1) % LEADER_EDITS.length);
        setTypedLength(0);
        setPhase('transition');
        return;
      }
      if (phase === 'transition') {
        setPreviousIndex(null);
        setPhase('typing');
        return;
      }
      if (typedLength < leader.name.length) {
        setTypedLength((current) => current + 1);
        return;
      }
      setPhase('hold');
    };

    if (phase === 'transition') {
      delay = 850;
    }
    if (phase === 'typing') {
      delay = typedLength < leader.name.length ? 90 : 700;
    }
    const timer = window.setTimeout(advance, delay);
    return () => window.clearTimeout(timer);
  }, [currentIndex, leader.name.length, phase, reduceMotion, typedLength]);

  const displayedName = (() => {
    switch (phase) {
      case 'hold':
        return leader.name;
      case 'typing':
        return leader.name.slice(0, typedLength);
      /* Mid-transition the name is empty, so the outgoing token fades without its label sliding. */
      default:
        return '';
    }
  })();

  return (
    <div className={styles.leaderToken} role="img" aria-label="An example leader token changing as it is edited">
      {previousIndex !== null ? (
        <div className={styles.leaderTokenPrevious}>
          <LeaderToken {...LEADER_EDITS[previousIndex]} image={portrait} />
        </div>
      ) : null}
      <div className={previousIndex === null ? styles.leaderTokenStable : styles.leaderTokenCurrent}>
        <LeaderToken {...leader} image={portrait} name={displayedName || '\u00a0'} />
      </div>
    </div>
  );
}

/*
 * No way back on either: the landing page is the top of every branch, so a link here would point at
 * the page the reader is already on.
 *
 * These were half-converted before, which is the failure mode the widget's own doc warns about: the
 * error frame used the body and not the frame, so its alert sat straight on the page background
 * while every other caller's sat on a pane, and the pending frame used neither, hand-rolling a
 * `Surface` whose missing padding prop resolved to none against the frame's xl.
 */
function HomepagePending() {
  return (
    <PageMessage size="hero" title="Make Dune your own">
      <LoadPending title="Setting the table">The latest work from the community is loading.</LoadPending>
    </PageMessage>
  );
}

function HomepageError({ error }: ErrorComponentProps) {
  return (
    <PageMessage size="hero" title="Make Dune your own">
      <LoadError title="The homepage could not be loaded" stale={isStaleClientData(error)}>
        {error.message}
      </LoadError>
    </PageMessage>
  );
}

function compactNumber(value: number) {
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}
