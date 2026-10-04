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
      <Group justify="center">
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
