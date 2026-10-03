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
import { AssetFace } from '@app/widgets/asset-face/AssetFace';
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
  validateSearch: (search: Record<string, unknown>): { variant?: 'A' | 'B' | 'C' } => ({
    variant: search.variant === 'A' || search.variant === 'B' || search.variant === 'C' ? search.variant : undefined,
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

/* Three throwaway homepage structures, selected by ?variant=A, B or C on the existing route.
 * The original loader and subscription stay in place; this prototype adds no writes or Play runtime.
 */
const prototypeNames = { A: 'The big reveal', B: 'The makers gallery', C: 'Your next move' } as const;
type PrototypeVariant = keyof typeof prototypeNames;
const prototypeMedia = '/homepage-prototype/';
const prototypeAssets = {
  deck: 'https://dune.zone/published/decks/ns7bpqj41ms5gnwras8223v8zx8cyeyr/cardback.jpg',
  water: 'https://dune.zone/published/gear-tokens/ns70854wjkwwfthp879v2cbvxh8d189d/token.jpg',
};

function HomepagePrototype({ variant }: { variant: PrototypeVariant }) {
  const navigate = Route.useNavigate();
  const change = (step: number) => {
    const keys = ['A', 'B', 'C'] as const;
    const next = keys[(keys.indexOf(variant) + step + keys.length) % keys.length]!;
    void navigate({ search: { variant: next }, hash: '', replace: true, resetScroll: true });
  };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]')
      )
        return;
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
            eyebrow="Dune Play · Coming soon"
            title={variant === 'C' ? 'Your next move' : 'The table is calling'}
            subtitle="Conquest. Diplomacy. Betrayal."
          />
          <Group justify="center">
            <Button component="a" href="#play-preview">
              See what's coming
            </Button>
            <Button variant="subtle" component="a" href="#make">
              Make something today <ArrowRight size={16} />
            </Button>
          </Group>
        </Stack>
      </PageLayout.Header>
      <PageLayout.Content>
        <div className={styles.prototype}>
          {variant === 'A' ? <PrototypeA /> : variant === 'B' ? <PrototypeB /> : <PrototypeC />}
          <div className={styles.prototypeSwitcher}>
            <Surface padding="sm">
              <Group gap="xs" wrap="nowrap" justify="center">
                <Button size="compact-sm" variant="subtle" aria-label="Previous design" onClick={() => change(-1)}>
                  ←
                </Button>
                <Stack gap={0} align="center">
                  <Text size="xs" c="dimmed">
                    PROTOTYPE · {variant} / 3
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
