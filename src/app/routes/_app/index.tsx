import { Anchor, Avatar, Badge, Box, Button, Group, SimpleGrid, Stack, Text, Title, Tooltip } from '@mantine/core';
import { useReducedMotion } from '@mantine/hooks';
import { createFileRoute, Link } from '@tanstack/react-router';
import type { ErrorComponentProps } from '@tanstack/react-router';
import { FactionCatalogueSpotlight } from '@ui/block/FactionCatalogueSpotlight';
import { LoadError } from '@ui/block/LoadError';
import { LoadPending } from '@ui/block/LoadPending';
import { PageTitle } from '@ui/block/PageTitle';
import { Section } from '@ui/block/Section';
import { formatStableDate } from '@ui/content/dates';
import { Eyebrow } from '@ui/content/Eyebrow';
import { PublishedImage } from '@ui/content/PublishedImage';
import { TopicIcon } from '@ui/content/TopicIcon';
import { CallToAction } from '@ui/control/CallToAction';
import { AsymmetricSplitLayout } from '@ui/layout/AsymmetricSplitLayout';
import { CanvasScale } from '@ui/layout/CanvasScale';
import { PageLayout } from '@ui/layout/PageLayout';
import { TriptychLayout } from '@ui/layout/TriptychLayout';
import { Bullets } from '@ui/list/Bullets';
import { Surface } from '@ui/surface';
import { ArrowRight, ExternalLink, MessageCircle, Printer, Trophy } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { FaRedditAlien } from 'react-icons/fa6';
import { SiBoardgamegeek, SiDiscord } from 'react-icons/si';

import { loadHomepage, useHomepage } from '@db/homepage';
import { isStaleClientData } from '@app/db/core/clientBoundary';
import { AssetFace } from '@app/widgets/asset-face/AssetFace';
import { PageMessage } from '@app/widgets/page-message/PageMessage';
import { AllianceCard } from '@game/assets/faction/alliance/Alliance';
import { LeaderToken } from '@game/assets/faction/leader/Leader';
import { TroopToken } from '@game/assets/faction/troop/Troop';
import { resolveAsset } from '@game/assets/resolveAsset';
import { backgroundPresets } from '@game/data/backgrounds';
import { card as cardSize } from '@game/data/sizes';
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
  validateSearch: (search: Record<string, unknown>): { variant?: PrototypeVariant } => ({
    variant:
      search.variant === 'A' ||
      search.variant === 'B' ||
      search.variant === 'C' ||
      search.variant === 'D' ||
      search.variant === 'E' ||
      search.variant === 'F' ||
      search.variant === 'G'
        ? search.variant
        : undefined,
  }),
  loader: loadHomepage,
  pendingComponent: HomepagePending,
  errorComponent: HomepageError,
  component: IndexPage,
});

function IndexPage() {
  const { variant } = Route.useSearch();
  const loaderData = Route.useLoaderData();
  const homepage = useHomepage({ initialData: loaderData });
  const data = homepage.data;

  if (!data) {
    return <HomepagePending />;
  }

  if (import.meta.env.DEV && variant) {
    return <HomepagePrototype variant={variant} />;
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
                      meta={`Created ${formatStableDate(data.spotlights.newArrival.created_at)}`}
                    />
                  ) : null}
                  {data.spotlights.freshlyUpdated ? (
                    <FactionCatalogueSpotlight
                      faction={data.spotlights.freshlyUpdated}
                      label="Freshly updated"
                      meta={`Updated ${formatStableDate(data.spotlights.freshlyUpdated.updated_at)}`}
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

/* Throwaway homepage structures, selected by the variant search parameter on the existing route.
 * The original loader and subscription stay in place; this prototype adds no writes or Play runtime.
 */
const prototypeNames = {
  A: 'The big reveal',
  B: 'The makers gallery',
  C: 'Your next move',
  D: 'Coming soon. Make it yours.',
  E: 'The grand reveal',
  F: 'The field journal',
  G: 'Worlds within worlds',
} as const;
type PrototypeVariant = keyof typeof prototypeNames;
const prototypeMedia = '/homepage-prototype/';
const prototypeAssets = {
  deck: 'https://dune.zone/published/decks/ns7bpqj41ms5gnwras8223v8zx8cyeyr/cardback.jpg',
  water: 'https://dune.zone/published/gear-tokens/ns70854wjkwwfthp879v2cbvxh8d189d/token.jpg',
};

function HomepagePrototype({ variant }: { variant: PrototypeVariant }) {
  const navigate = Route.useNavigate();
  const nextGeneration = variant === 'E' || variant === 'F' || variant === 'G';
  const change = (step: number) => {
    const keys: readonly PrototypeVariant[] = nextGeneration ? ['E', 'F', 'G'] : ['A', 'B', 'C', 'D'];
    const next = keys[(keys.indexOf(variant) + step + keys.length) % keys.length]!;
    void navigate({ search: { variant: next }, hash: '', replace: true, resetScroll: true });
  };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]')
      ) {
        return;
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        change(event.key === 'ArrowLeft' ? -1 : 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  return (
    <PageLayout>
      <PageLayout.Header size="hero">
        <Stack align="center" gap="lg">
          <PageTitle
            eyebrow={variant === 'D' || nextGeneration ? 'A first look at our next chapter' : 'Dune Play · Coming soon'}
            title={
              variant === 'D' || nextGeneration
                ? 'Dune Play is coming soon'
                : variant === 'C'
                  ? 'Your next move'
                  : 'The table is calling'
            }
            subtitle={
              variant === 'D' || nextGeneration
                ? 'Soon, your next game of Dune will be right here.'
                : 'Conquest. Diplomacy. Betrayal.'
            }
          />
          <Group justify="center">
            <Button component="a" href="#play-preview">
              {variant === 'D' || nextGeneration ? 'Take a sneak peek' : "See what's coming"}
            </Button>
            <Button variant="subtle" component="a" href="#make">
              Make something today <ArrowRight size={16} />
            </Button>
          </Group>
        </Stack>
      </PageLayout.Header>
      <PageLayout.Content>
        <div className={styles.prototype}>
          {variant === 'A' ? (
            <PrototypeA />
          ) : variant === 'B' ? (
            <PrototypeB />
          ) : variant === 'C' ? (
            <PrototypeC />
          ) : variant === 'D' ? (
            <PrototypeD />
          ) : (
            <NextHomepagePrototype key={variant} variant={variant} />
          )}
          <div className={styles.prototypeSwitcher}>
            <Surface padding="sm">
              <Group gap="xs" wrap="nowrap" justify="center">
                <Button size="compact-sm" variant="subtle" aria-label="Previous design" onClick={() => change(-1)}>
                  ←
                </Button>
                <Stack gap={0} align="center">
                  <Text size="xs" c="dimmed">
                    PROTOTYPE · {variant} ·{' '}
                    {nextGeneration ? `${['E', 'F', 'G'].indexOf(variant) + 1} / 3 new designs` : 'Earlier round'}
                  </Text>
                  <Text size="sm" fw={700}>
                    {prototypeNames[variant]}
                  </Text>
                </Stack>
                <Button size="compact-sm" variant="subtle" aria-label="Next design" onClick={() => change(1)}>
                  →
                </Button>
              </Group>
            </Surface>
          </div>
        </div>
      </PageLayout.Content>
    </PageLayout>
  );
}

function PlayStill() {
  return (
    <Stack gap="xs">
      <img
        className={styles.prototypePlay}
        src={`${prototypeMedia}play.jpg`}
        alt="Dune Play development preview: the Arrakis board, troops, leaders and a player's hand"
        width={1280}
        height={720}
        fetchPriority="high"
      />
      <Text size="xs" c="dimmed">
        Dune Play · Development preview · Coming soon
      </Text>
    </Stack>
  );
}

function PlayIntroduction() {
  return (
    <Section
      title="A new way to meet on Arrakis"
      eyebrow="The next chapter"
      description="The Dune table, in your browser. Dune Play is on its way."
    >
      <Text>
        Choose your faction. Read the table. Make the deal that changes everything. We're bringing the board, cards and
        conversations together in one place.
      </Text>
      <Text c="dimmed" size="sm">
        While we get the table ready, there's a whole game to make your own.
      </Text>
      <Button variant="subtle" component="a" href="#make" w="fit-content">
        Explore what you can make <ArrowRight size={16} />
      </Button>
    </Section>
  );
}

function RulebookArt() {
  return (
    <Stack gap="sm">
      <div className={styles.prototypeBooks}>
        <div className={styles.prototypeBook}>
          <PublishedImage
            src={`${prototypeMedia}cover.jpg`}
            name="Arrakis field guide demonstration cover"
            aspect={1.414}
          />
        </div>
        <div className={styles.prototypeSpread}>
          <PublishedImage
            src={`${prototypeMedia}factions.jpg`}
            name="Demonstration Rulebook spread introducing the Fremen and Ixians"
            aspect={1.414}
          />
        </div>
      </div>
      <Text size="xs" c="dimmed">
        Arrakis field guide · Demonstration made with the Rulebook editor
      </Text>
    </Stack>
  );
}

function RulesInvitation() {
  return (
    <Section
      title="Write the rules of your Arrakis"
      eyebrow="Rulesets & Rulebooks"
      description="Read another group's take on Dune. Then start shaping your own."
    >
      <Text>
        Bring factions, rulings and an illustrated Rulebook together in a Ruleset your group can keep improving.
      </Text>
      <Group>
        <Button renderRoot={(props) => <Link {...props} to="/rulesets" />}>Browse Rulesets</Button>
        <Button variant="subtle" renderRoot={(props) => <Link {...props} to="/rulesets/create" />}>
          Create a Ruleset
        </Button>
      </Group>
      <Text size="sm">
        Start with <Anchor href="https://dune.zone/rulesets/dreamrules">Dreamrules</Anchor>, maintained by Central and
        the dreamers Group.
      </Text>
    </Section>
  );
}

function FactionExample({ orks = false }: { orks?: boolean }) {
  return (
    <Stack gap="sm">
      <PublishedImage
        src={`${prototypeMedia}${orks ? 'orks' : 'discord'}.jpg`}
        name={orks ? 'Space Orks leader discs' : 'Discord Legends leader discs'}
        aspect={215 / 928}
      />
      <Group justify="space-between">
        <Anchor href={`https://dune.zone/factions/${orks ? 'space-orks' : 'discord-legends'}`} fw={700}>
          {orks ? 'Space Orks' : 'Discord Legends'} <ArrowRight size={14} />
        </Anchor>
        <Text size="xs" c="dimmed">
          Maintained by {orks ? 'BigDave' : 'Eichmal'}
        </Text>
      </Group>
      <Text size="sm">
        {orks
          ? 'Dice-fuelled battles and leaders who grow stronger. A homebrew work in progress.'
          : 'Your community becomes the cast. Familiar faces, with faction advantages that change as you play.'}
      </Text>
    </Stack>
  );
}

function FactionInvitation() {
  return (
    <Section
      title="Who says a faction has to be familiar?"
      eyebrow="Community factions"
      description="Give your friends their own leader discs. Invent an advantage that changes the game."
    >
      <div className={styles.prototypeCatalogue}>
        <FactionExample />
        <FactionExample orks />
      </div>
      <Group>
        <Button renderRoot={(props) => <Link {...props} to="/factions" />}>Explore factions</Button>
        <Button variant="subtle" renderRoot={(props) => <Link {...props} to="/factions/create" />}>
          Create a faction
        </Button>
      </Group>
    </Section>
  );
}

function AssetExamples() {
  return (
    <div className={styles.prototypeCatalogue}>
      <Stack align="center" gap="sm">
        <div className={styles.prototypeAsset}>
          <AssetFace href={prototypeAssets.deck} type="deck" data={null} name="No Field turquoise and gold cardback" />
        </div>
        <Anchor href="https://dune.zone/assets/deck/no-field" fw={700}>
          No Field
        </Anchor>
        <Text size="xs" c="dimmed">
          Deck · IHasPinecone
        </Text>
      </Stack>
      <Stack align="center" gap="sm">
        <div className={styles.prototypeAsset}>
          <AssetFace
            href={prototypeAssets.water}
            type="token-tech"
            data={null}
            name="Water Extraction gear-shaped token"
          />
        </div>
        <Anchor href="https://dune.zone/assets/token-tech/water-extraction" fw={700}>
          Water Extraction
        </Anchor>
        <Text size="xs" c="dimmed">
          Token · Amon_Tellur
        </Text>
      </Stack>
    </div>
  );
}

function AssetInvitation() {
  return (
    <Section
      title="One card can change the game"
      eyebrow="Cards, decks & tokens"
      description="Make the small pieces that bring a big idea to the table."
    >
      <Text>
        Design a deck, write a treachery card or give a new rule a token of its own. Preview your pieces as you build.
      </Text>
      <Group>
        <Button renderRoot={(props) => <Link {...props} to="/assets" />}>Browse Assets</Button>
        <Button
          variant="subtle"
          renderRoot={(props) => <Link {...props} to="/assets/$type/create" params={{ type: 'card-treachery' }} />}
        >
          Create a card
        </Button>
      </Group>
    </Section>
  );
}

function CollaborateInvitation() {
  return (
    <Surface padding="xl">
      <div className={styles.prototypeSplit}>
        <Section
          title="Make it a group effort"
          eyebrow="Better with your people"
          description="A Ruleset doesn't have to be one person's project."
        >
          <Text>
            Form a Group to maintain Rulesets, factions and Assets together. Bring the people with strong opinions about
            Dune. Give those ideas a shared home.
          </Text>
        </Section>
        <Stack align="flex-start" gap="md">
          <Text size="lg">Write together. Try it at your table. Come back with better rules.</Text>
          <Group>
            <Button renderRoot={(props) => <Link {...props} to="/groups/create" />}>Form a Group</Button>
            <Button variant="subtle" renderRoot={(props) => <Link {...props} to="/groups" />}>
              Explore Groups
            </Button>
          </Group>
          <Text size="xs" c="dimmed">
            Log in when you're ready to create. Browsing is open to everyone.
          </Text>
        </Stack>
      </div>
    </Surface>
  );
}

function RecentExamples() {
  return (
    <Section
      title="More ideas to borrow"
      eyebrow="Recently created"
      description="Fresh ideas from people making the game their own."
    >
      <Group justify="space-between" align="flex-start">
        <Stack gap={4}>
          <Anchor href="https://dune.zone/factions/discord-legends">Discord Legends</Anchor>
          <Text size="xs" c="dimmed">
            Faction · Eichmal
          </Text>
        </Stack>
        <Stack gap={4}>
          <Anchor href="https://dune.zone/assets/deck/no-field">No Field</Anchor>
          <Text size="xs" c="dimmed">
            Deck · IHasPinecone
          </Text>
        </Stack>
        <Stack gap={4}>
          <Anchor href="https://dune.zone/assets/token-tech/water-extraction">Water Extraction</Anchor>
          <Text size="xs" c="dimmed">
            Token · Amon_Tellur
          </Text>
        </Stack>
        <Button variant="subtle" renderRoot={(props) => <Link {...props} to="/assets" />}>
          Keep exploring <ArrowRight size={16} />
        </Button>
      </Group>
      <Text size="xs" c="dimmed">
        Prototype sample: the released page will select eligible recent creations automatically.
      </Text>
    </Section>
  );
}

function PrototypeA() {
  return (
    <div className={styles.prototypeFlow}>
      <section id="play-preview">
        <PlayStill />
      </section>
      <PlayIntroduction />
      <div id="make" className={styles.prototypeSplit}>
        <RulesInvitation />
        <RulebookArt />
      </div>
      <FactionInvitation />
      <div className={styles.prototypeSplit}>
        <AssetExamples />
        <AssetInvitation />
      </div>
      <CollaborateInvitation />
      <RecentExamples />
    </div>
  );
}

function PrototypeB() {
  return (
    <div className={styles.prototypeFlow}>
      <section id="play-preview" className={styles.prototypeSplit}>
        <PlayStill />
        <PlayIntroduction />
      </section>
      <Section
        id="make"
        title="Made by players. Open to your ideas."
        eyebrow="The makers gallery"
        description="A Rulebook, an unexpected faction, a deck that didn't exist until someone made it."
      >
        <div className={styles.prototypeMosaic}>
          <RulebookArt />
          <Stack gap="xl">
            <FactionExample />
            <FactionExample orks />
          </Stack>
          <AssetExamples />
        </div>
      </Section>
      <div className={styles.prototypeCatalogue}>
        <RulesInvitation />
        <AssetInvitation />
      </div>
      <Group>
        <Button renderRoot={(props) => <Link {...props} to="/factions/create" />}>Create a faction</Button>
        <Button variant="subtle" renderRoot={(props) => <Link {...props} to="/factions" />}>
          Browse factions
        </Button>
      </Group>
      <CollaborateInvitation />
      <RecentExamples />
    </div>
  );
}

function PrototypeC() {
  return (
    <div className={styles.prototypeFlow}>
      <section id="play-preview" className={styles.prototypeSplit}>
        <PlayIntroduction />
        <PlayStill />
      </section>
      <Section
        id="make"
        title="Your next great game starts here"
        eyebrow="Make it yours"
        description="Start with a rule you want to change. See where it takes you."
      >
        <Stack gap="xl">
          <div className={styles.prototypeChapter}>
            <Text className={styles.prototypeNumber}>01</Text>
            <RulesInvitation />
            <RulebookArt />
          </div>
          <div className={styles.prototypeChapter}>
            <Text className={styles.prototypeNumber}>02</Text>
            <Section title="Give your idea a faction">
              <Text>Write its advantages and make its leaders. Your group might be the inspiration.</Text>
              <Group>
                <Button renderRoot={(props) => <Link {...props} to="/factions/create" />}>Create a faction</Button>
                <Button variant="subtle" renderRoot={(props) => <Link {...props} to="/factions" />}>
                  Browse factions
                </Button>
              </Group>
            </Section>
            <Stack gap="xl">
              <FactionExample />
              <FactionExample orks />
            </Stack>
          </div>
          <div className={styles.prototypeChapter}>
            <Text className={styles.prototypeNumber}>03</Text>
            <AssetInvitation />
            <AssetExamples />
          </div>
        </Stack>
      </Section>
      <CollaborateInvitation />
      <RecentExamples />
    </div>
  );
}

const homebrewPortraits = [
  { key: 'house-nereth/varda-nereth', name: 'Varda Nereth', faction: 'atreides' },
  { key: 'pale-chorus/nela', name: 'Nela', faction: 'beneTleilaxu' },
  { key: 'korven-night/koraun', name: 'Koraun', faction: 'harkonnen' },
  { key: 'calar-flint/sera', name: 'Sera', faction: 'fremen' },
] as const;
const homebrewTroops = ['resonance-adept', 'blade-dancer', 'suspensor-lancer', 'water-keeper', 'mantis-guard'] as const;

function fanStyle(x: string, y: string, turn: string, delay: string): CSSProperties {
  return { '--fan-x': x, '--fan-y': y, '--fan-turn': turn, '--arrival-delay': delay } as CSSProperties;
}

function PrototypeD() {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.setAttribute('data-entered', 'true');
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.22 }
    );
    root.current?.querySelectorAll('[data-marketing-arrival]').forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={root} className={styles.marketingFlow}>
      <section id="play-preview" className={styles.marketingPreview} data-marketing-arrival>
        <div className={styles.marketingScreen}>
          <PlayStill />
        </div>
        <div className={styles.marketingIntro}>
          <Badge size="lg" color="dune">
            Coming soon to Dune Zone
          </Badge>
          <Section title="Your browser. Your friends. Arrakis.">
            <Text size="lg">We're building a new place to play Dune online. Here's a first look at the table.</Text>
            <Text size="sm" c="dimmed">
              Development preview. Play isn't available yet.
            </Text>
          </Section>
          <Button component="a" href="#make" variant="subtle" rightSection={<ArrowRight size={16} />}>
            In the meantime, make it yours
          </Button>
        </div>
      </section>

      <section id="make" className={styles.marketingChapter} data-marketing-arrival>
        <div className={styles.marketingCopy}>
          <RulesInvitation />
        </div>
        <div className={styles.marketingVisual}>
          <div className={styles.bookFan}>
            {[
              { file: 'map', name: 'An illustrated map of Arrakis', x: '-38%', y: '3%', turn: '-17deg' },
              { file: 'factions', name: 'Fremen and Ixian faction rules', x: '39%', y: '1%', turn: '14deg' },
              { file: 'cover', name: 'Arrakis field guide demonstration cover', x: '0%', y: '-3%', turn: '-3deg' },
            ].map((page, index) => (
              <div
                key={page.file}
                className={styles.fanPiece}
                style={fanStyle(page.x, page.y, page.turn, `${index * 110}ms`)}
              >
                <PublishedImage src={`${prototypeMedia}${page.file}.jpg`} name={page.name} aspect={1.414} />
              </div>
            ))}
          </div>
          <Text size="xs" c="dimmed" ta="center">
            Made in the Rulebook editor. A few pages from our demonstration.
          </Text>
        </div>
      </section>

      <section className={styles.marketingGallery} data-marketing-arrival>
        <div className={styles.marketingIntro}>
          <Section eyebrow="New artwork, ready for your homebrew" title="Meet your next troublemakers.">
            <Text size="lg">
              A new cast of leaders is waiting for a faction to call home. Pick a portrait. Give them a name. Make them
              dangerous.
            </Text>
          </Section>
        </div>
        <div className={styles.portraitFan}>
          {homebrewPortraits.map((portrait, index) => (
            <div
              key={portrait.key}
              className={styles.portraitPiece}
              style={fanStyle(
                `${(index - 1.5) * 77}%`,
                `${index % 2 ? -5 : 8}%`,
                `${(index - 1.5) * 7}deg`,
                `${index * 120}ms`
              )}
            >
              <img
                src={resolveAsset(`/image/leader/custom/${portrait.key}.png`, 'large')}
                width={640}
                height={640}
                alt={`${portrait.name}, homebrew leader portrait`}
                loading="lazy"
              />
            </div>
          ))}
        </div>
        <Group justify="center">
          <Button renderRoot={(props) => <Link {...props} to="/media" />}>Explore the artwork</Button>
          <Button variant="subtle" renderRoot={(props) => <Link {...props} to="/factions/create" />}>
            Create a faction
          </Button>
        </Group>
      </section>

      <section className={styles.marketingChapter} data-marketing-arrival>
        <div className={styles.troopParade} aria-label="New troop vector artwork">
          {homebrewTroops.map((troop, index) => (
            <div
              key={troop}
              className={styles.troopPiece}
              style={fanStyle('0%', `${index % 2 ? -15 : 10}%`, `${index % 2 ? 5 : -5}deg`, `${index * 100}ms`)}
            >
              <img
                src={`/vector/troop/${troop}.svg`}
                alt={troop.replaceAll('-', ' ')}
                width={160}
                height={200}
                loading="lazy"
              />
            </div>
          ))}
        </div>
        <div className={styles.marketingCopy}>
          <Section eyebrow="Fresh vectors" title="Send in the unusual suspects.">
            <Text size="lg">
              Blade dancers. Water keepers. Suspensor lancers. Give your forces a silhouette of their own.
            </Text>
            <Text>Our growing library of troop artwork is ready to use in your factions.</Text>
            <Button w="fit-content" renderRoot={(props) => <Link {...props} to="/media" />}>
              Find your forces
            </Button>
          </Section>
        </div>
      </section>

      <section className={styles.marketingChapter} data-marketing-arrival>
        <div className={styles.marketingCopy}>
          <AssetInvitation />
        </div>
        <div className={styles.marketingVisual}>
          <div className={styles.cardFan}>
            {[-1, 0, 1].map((offset, index) => (
              <div
                key={offset}
                className={styles.fanPiece}
                style={fanStyle(`${offset * 48}%`, `${Math.abs(offset) * 7}%`, `${offset * 17}deg`, `${index * 100}ms`)}
              >
                <AssetFace href={prototypeAssets.deck} type="deck" data={null} name="No Field cardback" />
              </div>
            ))}
            <div className={styles.fanToken}>
              <AssetFace href={prototypeAssets.water} type="token-tech" data={null} name="Water Extraction token" />
            </div>
          </div>
          <Text size="xs" c="dimmed" ta="center">
            <Anchor inherit href="https://dune.zone/assets/deck/no-field">
              No Field
            </Anchor>{' '}
            · IHasPinecone
            <br />
            <Anchor inherit href="https://dune.zone/assets/token-tech/water-extraction">
              Water Extraction
            </Anchor>{' '}
            · Amon_Tellur
          </Text>
        </div>
      </section>

      <section className={styles.marketingGallery} data-marketing-arrival>
        <div className={styles.marketingIntro}>
          <Section eyebrow="Already out there" title="It gets wonderfully weird.">
            <Text size="lg">
              Your Discord friends as leaders. Space Orks on Arrakis. See where other players took their ideas.
            </Text>
          </Section>
        </div>
        <div className={styles.marketingExamples}>
          <FactionExample />
          <FactionExample orks />
        </div>
        <Group justify="center">
          <Button renderRoot={(props) => <Link {...props} to="/factions" />}>Explore community factions</Button>
        </Group>
      </section>

      <section className={styles.marketingGallery} data-marketing-arrival>
        <div className={styles.groupTokens} aria-label="Illustrative leaders made with homebrew portraits">
          {homebrewPortraits.slice(0, 3).map((portrait, index) => (
            <div
              key={portrait.key}
              className={styles.groupToken}
              style={fanStyle(
                `${(index - 1) * 80}%`,
                `${index === 1 ? -8 : 5}%`,
                `${(index - 1) * 13}deg`,
                `${index * 130}ms`
              )}
            >
              <LeaderToken
                {...factionTokenFixtures[portrait.faction]}
                image={`/image/leader/custom/${portrait.key}.png`}
                name={portrait.name}
                strength={String(index + 3)}
              />
            </div>
          ))}
        </div>
        <div className={styles.marketingIntro}>
          <Section eyebrow="Made with your people" title="Good ideas deserve accomplices.">
            <Text size="lg">
              Form a Group. Build your Ruleset, factions and Assets together. Bring your wildest house rule and the
              friend who'll argue about it.
            </Text>
          </Section>
          <Group justify="center">
            <Button renderRoot={(props) => <Link {...props} to="/groups/create" />}>Form a Group</Button>
            <Button variant="subtle" renderRoot={(props) => <Link {...props} to="/groups" />}>
              Find your people
            </Button>
          </Group>
          <Text size="xs" c="dimmed">
            Illustrative leader discs using the homebrew artwork library.
          </Text>
        </div>
      </section>
      <RecentExamples />
    </div>
  );
}

/* Three new compositions explore the accepted qualities of D, not a production homepage. */
const cloudPortraits = [
  'house-nereth/varda-nereth',
  'pale-chorus/nela',
  'korven-night/koraun',
  'calar-flint/sera',
  'house-calven/maren-calven',
  'velnar-choir/vela',
  'house-osem/senna-osem',
  'talar-coil/tala',
  'avel-lattice/avela',
  'morrow-strain/nali',
  'house-ardent/kessa-ardent',
  'kelor-mantle/kelor',
  'seam-bound/mella',
  'sere-reservoir/arel',
  'khelt-dynasty/khelra',
  'house-nereth/eren-nereth',
  'pale-chorus/vessa',
  'calar-flint/hema',
  'house-calven/tovan-calven',
  'velnar-choir/sorel',
  'avel-lattice/orsa',
  'morrow-strain/tessa',
  'house-ardent/oren-ardent',
  'talar-coil/iva',
  'kelor-mantle/vaska',
  'seam-bound/verren',
  'sere-reservoir/sava',
  'khelt-dynasty/nera',
];
const cloudTroops = [
  'resonance-adept',
  'blade-dancer',
  'suspensor-lancer',
  'water-keeper',
  'mantis-guard',
  'juggernaut',
  'court-duelist',
  'needle-sniper',
  'salvage-warden',
  'veiled-adept',
  'spice-driller',
  'raptor-keeper',
  'masked-saboteur',
  'drum-herald',
  'furnace-bearer',
  'wire-hunter',
  'crescent-executioner',
  'ixian-engineer',
  'void-walker',
  'hook-climber',
  'desert-pathfinder',
  'shield-rammer',
  'gene-forged-brute',
  'house-bulwark',
  'banner-marshal',
  'siege-gunner',
] as const;
const cloudPlaces = [
  [12, 23, 18],
  [35, 36, 22],
  [62, 30, 18],
  [85, 42, 23],
  [49, 67, 23],
  [22, 77, 15],
  [71, 78, 18],
  [8, 62, 12],
  [29, 10, 12],
  [51, 12, 15],
  [76, 10, 13],
  [92, 17, 10],
  [43, 91, 10],
  [91, 85, 13],
  [56, 47, 11],
  [17, 48, 9],
  [71, 51, 14],
  [38, 64, 10],
  [10, 88, 9],
  [26, 54, 13],
  [61, 92, 11],
  [39, 17, 8],
  [80, 65, 10],
  [53, 33, 9],
  [7, 8, 8],
  [94, 60, 9],
  [24, 29, 9],
  [68, 6, 7],
];
const troopBackgrounds = [
  backgroundPresets.atreides,
  backgroundPresets.fremen,
  backgroundPresets.emperor,
  backgroundPresets.beneGesserit,
  backgroundPresets.ixian,
  backgroundPresets.guild,
  backgroundPresets.beneTleilaxu,
];
const showcaseCards = [
  { name: 'Supplies!', slug: 'supplies', id: 'ns78nmym3qpth6sm9wsfj3ka9s8cw350', credit: 'Central' },
  { name: 'Trishula!', slug: 'trishula', id: 'ns7cgwf2xm2ppj3c5jtpnnehf98cxcbq', credit: 'Central' },
  { name: 'Arrakeen', slug: 'arrakeen', id: 'ns74r72v6mdmnn8ahdmj27c8gs8cz5t6', credit: 'IHasPinecone' },
];

function NextHomepagePrototype({ variant }: { variant: 'E' | 'F' | 'G' }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.setAttribute('data-entered', 'true');
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.12 }
    );
    root.current?.querySelectorAll('[data-marketing-arrival]').forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={root} className={styles.nextHomepage}>
      {variant === 'E' ? <PrototypeE /> : variant === 'F' ? <PrototypeF /> : <PrototypeG />}
    </div>
  );
}

function BoardPreview({ detail = false }: { detail?: boolean }) {
  return (
    <img
      className={styles.boardPreview}
      src={`${prototypeMedia}board-${detail ? 'detail' : 'wide'}.jpg`}
      width={detail ? 1600 : 3000}
      height={detail ? 1000 : 1420}
      alt={
        detail
          ? 'Close-up of troops and faction tokens on the current Dune Play board'
          : 'The current Dune Play board with six faction tokens and troops on the table, without play controls'
      }
      loading={detail ? 'lazy' : 'eager'}
      fetchPriority={detail ? 'auto' : 'high'}
    />
  );
}

function PreviewCopy() {
  return (
    <Section eyebrow="A sneak peek · Coming soon" title="Your next game is taking shape.">
      <Text size="lg">
        The board. Your faction. The deal that changes everything. Soon you'll be able to play Dune right here.
      </Text>
      <Text size="sm" c="dimmed">
        A development preview of the new table. Play is not available yet.
      </Text>
    </Section>
  );
}

function OnlineRulebooks() {
  return (
    <Section eyebrow="Rulesets & Rulebooks" title="Your rules. Always within reach.">
      <Text size="lg">
        Read Rulebooks online and refer back to them during a game. Download a PDF for your table, your tablet or your
        printer.
      </Text>
      <Text>Find a Ruleset you love, or build one with your own rulings, factions and illustrated Rulebook.</Text>
      <Group>
        <Button renderRoot={(props) => <Link {...props} to="/rulesets" />}>Read the Rulesets</Button>
        <Button variant="subtle" renderRoot={(props) => <Link {...props} to="/rulesets/create" />}>
          Write your own
        </Button>
      </Group>
      <Text size="sm">
        Try <Anchor href="https://dune.zone/rulesets/dreamrules">Dreamrules</Anchor>, maintained by Central and the
        dreamers Group.
      </Text>
    </Section>
  );
}

function BookCloud() {
  return (
    <div className={styles.newBookFan}>
      {['map', 'factions', 'cover'].map((file, index) => (
        <div
          className={styles.fanPiece}
          key={file}
          style={fanStyle(
            `${(index === 2 ? 0 : index === 0 ? -1 : 1) * 40}%`,
            `${index === 2 ? -7 : 2}%`,
            `${index === 2 ? -3 : index === 0 ? -17 : 14}deg`,
            `${index * 120}ms`
          )}
        >
          <PublishedImage
            src={`${prototypeMedia}${file}.jpg`}
            name={`Arrakis field guide demonstration ${file}`}
            aspect={1.414}
          />
        </div>
      ))}
    </div>
  );
}

function ArtworkCloud({ vectors = false }: { vectors?: boolean }) {
  const entries = vectors ? cloudTroops : cloudPortraits;
  return (
    <div
      className={styles.artworkCloud}
      aria-label={vectors ? 'A cloud of 26 new troop designs' : 'A cloud of 28 homebrew leader portraits'}
    >
      {entries.map((key, index) => {
        const [x, y, size] = cloudPlaces[index]!;
        const name = key.split('/').at(-1)!.replaceAll('-', ' ');
        return (
          <div
            className={styles.cloudPiece}
            key={key}
            style={
              {
                '--cloud-x': `${x}%`,
                '--cloud-size': `${size}%`,
                '--wing-x': `${x! < 50 ? 8 + x! * 0.32 : 76 + (x! - 50) * 0.32}%`,
                left: 'var(--cloud-x)',
                top: `${y}%`,
                width: 'var(--cloud-size)',
                '--cloud-turn': `${((index * 7) % 25) - 12}deg`,
                '--arrival-delay': `${(index % 8) * 70}ms`,
                zIndex: index < 7 ? 3 : 1,
              } as CSSProperties
            }
          >
            {vectors ? (
              <div className={styles.vectorDisc} role="img" aria-label={name}>
                <TroopToken
                  background={troopBackgrounds[index % troopBackgrounds.length]!}
                  image={`/vector/troop/${cloudTroops[index]!}.svg`}
                  star={undefined}
                  hue={undefined}
                  striped={false}
                />
              </div>
            ) : (
              <img
                src={resolveAsset(`/image/leader/custom/${key}.png`, 'large')}
                alt={`${name}, homebrew portrait`}
                width={640}
                height={640}
                loading="lazy"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function PortraitCopy() {
  return (
    <Section eyebrow="A whole new cast" title="So many faces. So many terrible plans.">
      <Text size="lg">
        Strange houses. Familiar schemers. People who definitely know something you don't. Our growing portrait library
        is ready for your homebrew.
      </Text>
      <Group>
        <Button renderRoot={(props) => <Link {...props} to="/media" />}>Meet the whole cast</Button>
        <Button variant="subtle" renderRoot={(props) => <Link {...props} to="/factions/create" />}>
          Create a faction
        </Button>
      </Group>
    </Section>
  );
}

function VectorCopy() {
  return (
    <Section eyebrow="New vectors, ready to use" title="An army of possibilities.">
      <Text size="lg">
        Blade dancers, gene-forged brutes and water keepers. Pick the forces that belong in your world.
      </Text>
      <Text>Combine the artwork with your faction's colours to make tokens of your own.</Text>
      <Button w="fit-content" renderRoot={(props) => <Link {...props} to="/media" />}>
        Explore the vector library
      </Button>
    </Section>
  );
}

function QualityCards({ spread = false }: { spread?: boolean }) {
  return (
    <div className={styles.cardShowcase}>
      <div className={spread ? styles.cardExhibition : styles.qualityCardFan}>
        {showcaseCards.map((card, index) => (
          <div
            key={card.id}
            className={styles.showcaseCard}
            style={fanStyle(
              `${(index - 1) * 65}%`,
              `${index === 1 ? -8 : 7}%`,
              `${(index - 1) * 13}deg`,
              `${index * 150}ms`
            )}
          >
            <AssetFace
              href={`https://dune.zone/published/cards/${card.id}/card.jpg`}
              type="card-treachery"
              data={null}
              name={card.name}
            />
          </div>
        ))}
      </div>
      <Group justify="center" gap="xl" className={styles.cardCredits}>
        {showcaseCards.map((card) => (
          <div key={card.id} className={styles.cardCredit}>
            <Anchor href={`https://dune.zone/assets/card-treachery/${card.slug}`} fw={700}>
              {card.name}
            </Anchor>
            <Text size="xs" c="dimmed">
              {card.credit}
            </Text>
          </div>
        ))}
      </Group>
    </div>
  );
}

function AllianceInvitation() {
  return (
    <Section eyebrow="Groups" title="Some alliances are worth keeping.">
      <Text size="lg">
        Find your allies. Form a Group to create and maintain Rulesets, factions and Assets together.
      </Text>
      <Text>Pool your ideas, debate the details, and make something worth bringing to the table.</Text>
      <Group>
        <Button renderRoot={(props) => <Link {...props} to="/groups/create" />}>Form an alliance</Button>
        <Button variant="subtle" renderRoot={(props) => <Link {...props} to="/groups" />}>
          Explore Groups
        </Button>
      </Group>
    </Section>
  );
}

function GroupAllianceCard() {
  return (
    <div className={styles.allianceCard}>
      <CanvasScale canvasWidth={cardSize.width} canvasHeight={cardSize.height} rounded>
        <AllianceCard
          background={backgroundPresets.atreides}
          logo="/vector/generic/alliance.svg"
          title="Your Group"
          troop="/vector/troop/banner-marshal.svg"
          decals={[]}
          text={
            'Pool your ideas.\nBuild Rulesets, factions and Assets together.\n\nYour shared victory condition:\nmake the game you want to play.'
          }
        />
      </CanvasScale>
      <Text size="xs" c="dimmed" ta="center" mt="md">
        An alliance card made for this invitation.
      </Text>
    </div>
  );
}

function OrkLeaders() {
  const leaders = [
    { image: '/image/leader/alien/buzcle.png', name: 'Mad Dok Grotsnik', strength: '2' },
    { image: '/image/leader/alien/eeloo.png', name: 'Ufthak Blackhawk', strength: '4' },
    { image: '/image/leader/alien/eeriva.png', name: 'Kaptin Badrukk', strength: '6' },
  ] as const;
  return (
    <div className={styles.orkLeaders}>
      {leaders.map((leader, index) => (
        <div
          className={styles.orkDisc}
          key={leader.name}
          style={fanStyle(
            `${(index - 1) * 79}%`,
            `${index === 1 ? -13 : 9}%`,
            `${(index - 1) * 12}deg`,
            `${index * 130}ms`
          )}
        >
          <LeaderToken
            {...leader}
            logo="/vector/generic/axes.svg"
            background={{
              colors: ['#52a32b', '#52a32b'],
              definition: 0.5,
              image: '/image/texture/021.jpg',
              influence: 1,
              invert: true,
            }}
          />
        </div>
      ))}
    </div>
  );
}

function CommunityCopy() {
  return (
    <Section eyebrow="Made by players" title="Yes, someone put Space Orks on Arrakis.">
      <Text size="lg">
        Dice-fuelled battles. Leaders who get stronger. BigDave's Space Orks take homebrew in a rather different
        direction.
      </Text>
      <Text size="sm" c="dimmed">
        A community faction in progress, maintained by BigDave.
      </Text>
      <Group>
        <Button component="a" href="https://dune.zone/factions/space-orks">
          Meet the Space Orks
        </Button>
        <Button variant="subtle" renderRoot={(props) => <Link {...props} to="/factions" />}>
          Explore more factions
        </Button>
      </Group>
    </Section>
  );
}

function PrototypeE() {
  return (
    <div className={styles.cinemaFlow}>
      <section id="play-preview" className={styles.cinemaOpening} data-marketing-arrival>
        <div className={styles.wideBoard}>
          <BoardPreview />
        </div>
        <div className={styles.centerCopy}>
          <PreviewCopy />
        </div>
      </section>
      <section id="make" className={styles.cinemaFeature} data-marketing-arrival>
        <div className={styles.centerCopy}>
          <OnlineRulebooks />
        </div>
        <BookCloud />
        <Text size="xs" c="dimmed" ta="center">
          A few pages from the demonstration Rulebook.
        </Text>
      </section>
      <section className={styles.cinemaFeature} data-marketing-arrival>
        <div className={styles.centerCopy}>
          <PortraitCopy />
        </div>
        <ArtworkCloud />
      </section>
      <section className={styles.cinemaFeature} data-marketing-arrival>
        <div className={styles.centerCopy}>
          <VectorCopy />
        </div>
        <ArtworkCloud vectors />
      </section>
      <section className={styles.editorialRow} data-marketing-arrival>
        <AssetInvitation />
        <QualityCards />
      </section>
      <section className={styles.editorialRow} data-marketing-arrival>
        <OrkLeaders />
        <CommunityCopy />
      </section>
      <section className={styles.allianceRow} data-marketing-arrival>
        <GroupAllianceCard />
        <AllianceInvitation />
      </section>
      <RecentExamples />
    </div>
  );
}

function PrototypeF() {
  return (
    <div className={styles.journalFlow}>
      <section id="play-preview" className={styles.journalOpening} data-marketing-arrival>
        <div className={styles.journalBoard}>
          <BoardPreview />
        </div>
        <div className={styles.journalDetail}>
          <BoardPreview detail />
        </div>
        <div className={styles.journalLead}>
          <PreviewCopy />
        </div>
      </section>
      <section id="make" className={styles.editorialRow} data-marketing-arrival>
        <BookCloud />
        <OnlineRulebooks />
      </section>
      <section className={styles.cloudEditorial} data-marketing-arrival>
        <ArtworkCloud />
        <PortraitCopy />
      </section>
      <section className={styles.cloudEditorialReverse} data-marketing-arrival>
        <VectorCopy />
        <ArtworkCloud vectors />
      </section>
      <section className={styles.cinemaFeature} data-marketing-arrival>
        <div className={styles.centerCopy}>
          <AssetInvitation />
        </div>
        <QualityCards spread />
      </section>
      <section className={styles.editorialRow} data-marketing-arrival>
        <CommunityCopy />
        <OrkLeaders />
      </section>
      <section className={styles.journalAlliance} data-marketing-arrival>
        <div className={styles.centerCopy}>
          <AllianceInvitation />
        </div>
        <GroupAllianceCard />
      </section>
      <RecentExamples />
    </div>
  );
}

function PrototypeG() {
  return (
    <div className={styles.orbitFlow}>
      <section id="play-preview" className={styles.orbitOpening} data-marketing-arrival>
        <div className={styles.orbitLead}>
          <PreviewCopy />
        </div>
        <div className={styles.orbitBoard}>
          <BoardPreview />
        </div>
        <div className={styles.orbitDetail}>
          <BoardPreview detail />
        </div>
      </section>
      <section id="make" className={styles.orbitChapter} data-marketing-arrival>
        <div className={styles.orbitCopy}>
          <OnlineRulebooks />
        </div>
        <BookCloud />
      </section>
      <section className={styles.orbitCloudChapter} data-marketing-arrival>
        <ArtworkCloud />
        <div className={styles.centerCopy}>
          <PortraitCopy />
        </div>
      </section>
      <section className={styles.orbitCloudChapter} data-marketing-arrival>
        <ArtworkCloud vectors />
        <div className={styles.centerCopy}>
          <VectorCopy />
        </div>
      </section>
      <section className={styles.orbitCards} data-marketing-arrival>
        <QualityCards />
        <div className={styles.centerCopy}>
          <AssetInvitation />
        </div>
      </section>
      <section className={styles.cinemaFeature} data-marketing-arrival>
        <OrkLeaders />
        <div className={styles.centerCopy}>
          <CommunityCopy />
        </div>
      </section>
      <section className={styles.allianceRow} data-marketing-arrival>
        <AllianceInvitation />
        <GroupAllianceCard />
      </section>
      <RecentExamples />
    </div>
  );
}
