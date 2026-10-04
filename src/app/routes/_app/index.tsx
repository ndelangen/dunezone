import { Anchor, Button, Group, Stack, Text } from '@mantine/core';
import { createFileRoute, Link } from '@tanstack/react-router';
import { PageTitle } from '@ui/block/PageTitle';
import { Section } from '@ui/block/Section';
import { PublishedImage } from '@ui/content/PublishedImage';
import { CanvasScale } from '@ui/layout/CanvasScale';
import { PageLayout } from '@ui/layout/PageLayout';
import { ArrowRight } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';

import { useMotionAllowed } from '@app/styles/motion';
import { AssetFace } from '@app/widgets/asset-face/AssetFace';
import { AllianceCard } from '@game/assets/faction/alliance/Alliance';
import { LeaderToken } from '@game/assets/faction/leader/Leader';
import { TroopToken } from '@game/assets/faction/troop/Troop';
import { resolveAsset } from '@game/assets/resolveAsset';
import { backgroundPresets } from '@game/data/backgrounds';
import { card as cardSize } from '@game/data/sizes';

import styles from './index.module.css';

export const Route = createFileRoute('/_app/')({ component: IndexPage });

function IndexPage() {
  const root = useRef<HTMLDivElement>(null);
  const motionAllowed = useMotionAllowed();
  useEffect(() => {
    if (!motionAllowed || typeof IntersectionObserver === 'undefined') {
      return;
    }
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
    root.current
      ?.querySelectorAll('[data-marketing-arrival]:not([data-entered])')
      .forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [motionAllowed]);
  return (
    <PageLayout>
      <PageLayout.Header size="hero">
        <Stack align="center" gap="lg">
          <PageTitle
            eyebrow="A first look at our next chapter"
            title="Dune Play is coming soon"
            subtitle="Soon, your next game of Dune will be right here."
          />
          <Group justify="center">
            <Button component="a" href="#play-preview">
              Take a sneak peek
            </Button>
            <Button variant="subtle" component="a" href="#make">
              Make something today <ArrowRight size={16} aria-hidden />
            </Button>
          </Group>
        </Stack>
      </PageLayout.Header>
      <PageLayout.Content>
        <div ref={root} className={styles.homepage} data-homepage-motion={motionAllowed ? 'on' : 'off'}>
          <HomepageChapters />
        </div>
      </PageLayout.Content>
    </PageLayout>
  );
}

function BoardPreview() {
  return (
    <img
      className={styles.boardPreview}
      src={resolveAsset('/web/homepage/board.png', 'large')}
      srcSet={`${resolveAsset('/web/homepage/board.png', 'small')} 1080w, ${resolveAsset('/web/homepage/board.png', 'large')} 3000w`}
      sizes="200vw"
      width={3000}
      height={1420}
      alt="The current Dune Play board with six faction tokens and troops on the table, without play controls"
      loading="eager"
      fetchPriority="high"
    />
  );
}

function fanStyle(x: string, y: string, turn: string, delay: string): CSSProperties {
  return { '--fan-x': x, '--fan-y': y, '--fan-turn': turn, '--arrival-delay': delay } as CSSProperties;
}

const cloudArtwork = [
  { portrait: 'house-nereth/varda-nereth', troop: 'resonance-adept', x: 12, y: 23, size: 18 },
  { portrait: 'pale-chorus/nela', troop: 'blade-dancer', x: 35, y: 36, size: 22 },
  { portrait: 'korven-night/koraun', troop: 'suspensor-lancer', x: 62, y: 30, size: 18 },
  { portrait: 'calar-flint/sera', troop: 'water-keeper', x: 85, y: 42, size: 23 },
  { portrait: 'house-calven/maren-calven', troop: 'mantis-guard', x: 49, y: 67, size: 23 },
  { portrait: 'velnar-choir/vela', troop: 'juggernaut', x: 22, y: 77, size: 15 },
  { portrait: 'house-osem/senna-osem', troop: 'court-duelist', x: 71, y: 78, size: 18 },
  { portrait: 'talar-coil/tala', troop: 'needle-sniper', x: 8, y: 62, size: 12 },
  { portrait: 'avel-lattice/avela', troop: 'salvage-warden', x: 29, y: 10, size: 12 },
  { portrait: 'morrow-strain/nali', troop: 'veiled-adept', x: 51, y: 12, size: 15 },
  { portrait: 'house-ardent/kessa-ardent', troop: 'spice-driller', x: 76, y: 10, size: 13 },
  { portrait: 'kelor-mantle/kelor', troop: 'raptor-keeper', x: 92, y: 17, size: 10 },
  { portrait: 'seam-bound/mella', troop: 'masked-saboteur', x: 43, y: 91, size: 10 },
  { portrait: 'sere-reservoir/arel', troop: 'drum-herald', x: 91, y: 85, size: 13 },
  { portrait: 'khelt-dynasty/khelra', troop: 'furnace-bearer', x: 56, y: 47, size: 11 },
  { portrait: 'house-nereth/eren-nereth', troop: 'wire-hunter', x: 17, y: 48, size: 9 },
  { portrait: 'pale-chorus/vessa', troop: 'crescent-executioner', x: 71, y: 51, size: 14 },
  { portrait: 'calar-flint/hema', troop: 'ixian-engineer', x: 38, y: 64, size: 10 },
  { portrait: 'house-calven/tovan-calven', troop: 'void-walker', x: 10, y: 88, size: 9 },
  { portrait: 'velnar-choir/sorel', troop: 'hook-climber', x: 26, y: 54, size: 13 },
  { portrait: 'avel-lattice/orsa', troop: 'desert-pathfinder', x: 61, y: 92, size: 11 },
  { portrait: 'morrow-strain/tessa', troop: 'shield-rammer', x: 39, y: 17, size: 8 },
  { portrait: 'house-ardent/oren-ardent', troop: 'gene-forged-brute', x: 80, y: 65, size: 10 },
  { portrait: 'talar-coil/iva', troop: 'house-bulwark', x: 53, y: 33, size: 9 },
  { portrait: 'kelor-mantle/vaska', troop: 'banner-marshal', x: 7, y: 8, size: 8 },
  { portrait: 'seam-bound/verren', troop: 'siege-gunner', x: 94, y: 60, size: 9 },
  { portrait: 'sere-reservoir/sava', troop: undefined, x: 24, y: 29, size: 9 },
  { portrait: 'khelt-dynasty/nera', troop: undefined, x: 68, y: 6, size: 7 },
] as const;
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

function AssetInvitation() {
  return (
    <Section
      className={styles.editorialCopy}
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

function PreviewCopy() {
  return (
    <Section alignment="center" eyebrow="A sneak peek · Coming soon" title="Your next game is taking shape.">
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
    <Section alignment="center" eyebrow="Rulesets & Rulebooks" title="Your rules. Always within reach.">
      <Text size="lg">
        Read Rulebooks online and refer back to them during a game. Download a PDF for your table, your tablet or your
        printer.
      </Text>
      <Text>Find a Ruleset you love, or build one with your own rulings, factions and illustrated Rulebook.</Text>
      <Group justify="center">
        <Button renderRoot={(props) => <Link {...props} to="/rulesets" />}>Read the Rulesets</Button>
        <Button variant="subtle" renderRoot={(props) => <Link {...props} to="/rulesets/create" />}>
          Write your own
        </Button>
      </Group>
      <Text size="sm">
        Try{' '}
        <Anchor
          renderRoot={(props) => <Link {...props} to="/rulesets/$rulesetSlug" params={{ rulesetSlug: 'dreamrules' }} />}
        >
          Dreamrules
        </Anchor>
        , maintained by Central and the dreamers Group.
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
            src={resolveAsset(`/web/homepage/${file}.jpg`, 'large')}
            name={`Arrakis field guide demonstration ${file}`}
            aspect={1.414}
          />
        </div>
      ))}
    </div>
  );
}

function ArtworkCloud({ vectors = false }: { vectors?: boolean }) {
  const entries = vectors ? cloudArtwork.filter((entry) => entry.troop) : cloudArtwork;
  return (
    <div
      className={styles.artworkCloud}
      aria-label={`A cloud of ${entries.length} ${vectors ? 'new troop designs' : 'homebrew leader portraits'}`}
    >
      {entries.map(({ portrait, troop, x, y, size }, index) => {
        const key = vectors ? troop : portrait;
        if (!key) {
          return null;
        }
        const name = key.split('/').at(-1)!.replaceAll('-', ' ');
        return (
          <div
            className={styles.cloudPiece}
            key={key}
            style={
              {
                left: `${x}%`,
                top: `${y}%`,
                width: `${size}%`,
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
                  image={`/vector/troop/${troop!}.svg`}
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
    <Section alignment="center" eyebrow="A whole new cast" title="So many faces. So many terrible plans.">
      <Text size="lg">
        Strange houses. Familiar schemers. People who definitely know something you don't. Our growing portrait library
        is ready for your homebrew.
      </Text>
      <Group justify="center">
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
    <Section alignment="center" eyebrow="New vectors, ready to use" title="An army of possibilities.">
      <Text size="lg">
        Blade dancers, gene-forged brutes and water keepers. Pick the forces that belong in your world.
      </Text>
      <Text>Combine the artwork with your faction's colours to make tokens of your own.</Text>
      <Button className={styles.centerAction} w="fit-content" renderRoot={(props) => <Link {...props} to="/media" />}>
        Explore the vector library
      </Button>
    </Section>
  );
}

function QualityCards() {
  return (
    <div className={styles.cardShowcase}>
      <div className={styles.qualityCardFan}>
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
            <Anchor
              renderRoot={(props) => (
                <Link {...props} to="/assets/$type/$slug" params={{ type: 'card-treachery', slug: card.slug }} />
              )}
              fw={700}
            >
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
    <Section className={styles.editorialCopy} eyebrow="Groups" title="Some alliances are worth keeping.">
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
      <Text size="xs" ta="center" mt="md">
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
          <div className={styles.vectorDisc}>
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
        </div>
      ))}
    </div>
  );
}

function CommunityCopy() {
  return (
    <Section className={styles.editorialCopy} eyebrow="Made by players" title="Yes, someone put Space Orks on Arrakis.">
      <Text size="lg">
        Dice-fuelled battles. Leaders who get stronger. BigDave's Space Orks take homebrew in a rather different
        direction.
      </Text>
      <Text size="sm" c="dimmed">
        A community faction in progress, maintained by BigDave.
      </Text>
      <Group>
        <Button
          renderRoot={(props) => <Link {...props} to="/factions/$factionId" params={{ factionId: 'space-orks' }} />}
        >
          Meet the Space Orks
        </Button>
        <Button variant="subtle" renderRoot={(props) => <Link {...props} to="/factions" />}>
          Explore more factions
        </Button>
      </Group>
    </Section>
  );
}

function HomepageChapters() {
  return (
    <div className={styles.cinemaFlow}>
      <section id="play-preview" className={styles.cinemaOpening} data-marketing-arrival>
        <div className={styles.wideBoard}>
          <BoardPreview />
        </div>
        <div className={styles.previewCopy}>
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
    </div>
  );
}
