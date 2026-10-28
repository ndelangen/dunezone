import { VisuallyHidden } from '@mantine/core';
import type { GlossaryTopic } from '@shared/glossary/terms';
import { SPICE_TOKEN_HREF } from '@shared/play/spiceToken';
import { CanvasScale } from '@ui/layout/CanvasScale';
import clsx from 'clsx';
import type { ReactNode } from 'react';

import { SpiceCard } from '@game/assets/card/Spice';
import { LeaderToken } from '@game/assets/faction/leader/Leader';
import { Token } from '@game/assets/faction/token/Token';
import { TraitorCard } from '@game/assets/faction/traitor/Traitor';
import { TroopToken } from '@game/assets/faction/troop/Troop';
import { BattleWheel } from '@game/assets/generic/BattleWheel';
import { TreacheryCard } from '@game/assets/treachery/Treachery';
import { backgroundPresets } from '@game/data/backgrounds';
import { card, disc } from '@game/data/sizes';
import { factionTokenFixtures } from '@game/fixtures/factionTokens';
import { treacheryCardFixtures } from '@game/fixtures/treacheryCards';

import { BoardTeaching } from './BoardTeaching';
import { useTeachingStep, useTeachingTerm } from './teaching';
import styles from './TopicVisual.module.css';

const atreides = factionTokenFixtures.atreides;

const atreidesTroop = {
  background: atreides.background,
  image: '/vector/troop/atreides.svg',
  star: undefined,
  hue: undefined,
  striped: undefined,
} as const;

const beneGesseritTroop = {
  background: backgroundPresets.beneGesserit,
  image: '/vector/troop/bene-gesserit.svg',
  star: undefined,
  hue: undefined,
  striped: undefined,
} as const;

/* Terms whose demonstration lights up pieces that carry another term's caption. */
const DEMONSTRATED_BY: Record<string, readonly string[]> = {
  battle: ['battle-wheel', 'dialed', 'supported', 'battle-plan'],
  spice: ['spice-bank', 'spice-reserve'],
  deal: ['bribe'],
  'binding-deal': ['bribe'],
  'tleilaxu-tanks': ['troop', 'elite-troop', 'leader'],
};

function demonstrates(term: string | null, anchor: string) {
  return term !== null && (term === anchor || (DEMONSTRATED_BY[term]?.includes(anchor) ?? false));
}

/*
 * A piece of game artwork with the glossary word under it, linking to that word's entry.
 * An `extra` piece drops out when the picture's column is too slim for two pieces side by side.
 */
function Piece({
  caption,
  anchor,
  extra = false,
  captionHidden = false,
  lit,
  children,
}: {
  caption: string;
  anchor: string;
  extra?: boolean;
  /** For art that already prints its own name, such as a card: the caption still names the link. */
  captionHidden?: boolean;
  /** Set by a picture that steps through its own sequence, overriding which term lights the piece. */
  lit?: boolean;
  children: ReactNode;
}) {
  const term = useTeachingTerm();
  const demonstrating = lit ?? demonstrates(term, anchor);
  return (
    <a
      className={clsx(styles.piece, extra && styles.extra)}
      href={`#${anchor}`}
      data-demonstrating={demonstrating || undefined}
    >
      <span className={styles.art} aria-hidden="true">
        {children}
      </span>
      {captionHidden ? <VisuallyHidden>{caption}</VisuallyHidden> : <span className={styles.caption}>{caption}</span>}
    </a>
  );
}

/* A troop is half the diameter of a leader or faction token, as on the table. */
function Disc({ troop = false, children }: { troop?: boolean; children: ReactNode }) {
  return (
    <span className={clsx(styles.disc, troop && styles.troop)}>
      <CanvasScale canvasWidth={disc.width} canvasHeight={disc.height}>
        {children}
      </CanvasScale>
    </span>
  );
}

function GameCard({ children }: { children: ReactNode }) {
  return (
    <span className={styles.card}>
      <CanvasScale canvasWidth={card.width} canvasHeight={card.height}>
        {children}
      </CanvasScale>
    </span>
  );
}

function Glyph({ src }: { src: string }) {
  return <span className={styles.glyph} style={{ maskImage: `url(${src})`, WebkitMaskImage: `url(${src})` }} />;
}

const PHASES = [
  { name: 'Storm', icon: '/vector/icon/storm_disc.svg' },
  { name: 'Spice Blow', icon: '/vector/icon/spice-blow_disc.svg' },
  { name: 'CHOAM Charity', icon: '/vector/icon/spice-alt.svg', ring: true },
  { name: 'Bidding', icon: '/vector/icon/bidding_disc.svg', anchor: 'bidding' },
  { name: 'Revival', icon: '/vector/icon/revival.svg', anchor: 'revival', ring: true },
  { name: 'Shipment and Movement', icon: '/vector/icon/shipment_disc.svg', anchor: 'shipment-and-movement' },
  { name: 'Battle', icon: '/vector/icon/combat_disc.svg', anchor: 'battle' },
  { name: 'Spice Collection', icon: '/vector/icon/collection_disc.svg', anchor: 'spice-collection' },
  { name: 'Mentat Pause', icon: '/vector/icon/mentat.svg', ring: true },
] as const;

/* The Bene Gesserit troop turns over and back while its term is demonstrated, showing both of its sides. */
function FlippingTroop() {
  const flipped = useTeachingStep(useTeachingTerm() === 'flipped-troop', 2, 1200) === 1;
  return (
    <span className={styles.flip} data-flipped={flipped || undefined}>
      <span className={styles.face}>
        <Disc troop>
          <TroopToken {...beneGesseritTroop} striped />
        </Disc>
      </span>
      <span className={clsx(styles.face, styles.back)}>
        <Disc troop>
          <TroopToken {...beneGesseritTroop} />
        </Disc>
      </span>
    </span>
  );
}

function PiecesVisual() {
  return (
    <div className={styles.row}>
      <Piece caption="Troop" anchor="troop">
        <Disc troop>
          <TroopToken {...atreidesTroop} />
        </Disc>
      </Piece>
      <Piece caption="Elite troop" anchor="elite-troop">
        <Disc troop>
          <TroopToken
            background={backgroundPresets.fremen}
            image="/vector/troop/fremen.svg"
            star="/vector/troop_modifier/star-left.svg"
            hue="red"
            striped={undefined}
          />
        </Disc>
      </Piece>
      <Piece caption="Flipped troop" anchor="flipped-troop">
        <FlippingTroop />
      </Piece>
      <Piece caption="Reserves" anchor="reserves" extra>
        <span className={clsx(styles.troopStack, styles.arriving)}>
          {[0, 1, 2].map((index) => (
            <Disc key={index} troop>
              <TroopToken {...atreidesTroop} />
            </Disc>
          ))}
        </span>
      </Piece>
      <Piece caption="Leader" anchor="leader">
        <Disc>
          <LeaderToken
            background={atreides.background}
            image="/image/leader/official/thufir.png"
            logo="/vector/logo/atreides.svg"
            name="Thufir Hawat"
            strength="5"
          />
        </Disc>
      </Piece>
      <Piece caption="Token" anchor="token">
        <Disc>
          <Token {...atreides} />
        </Disc>
      </Piece>
    </div>
  );
}

/* Which phases a turn term lights up at each step of its demonstration. */
function litPhases(term: string | null, step: number): ReadonlySet<string> {
  if (term === 'turn') {
    return new Set(PHASES.slice(0, step + 1).map((phase) => phase.name));
  }
  if (term === 'phase') {
    return new Set([PHASES[step]!.name]);
  }
  const named = PHASES.find((phase) => 'anchor' in phase && phase.anchor === term);
  return new Set(named ? [named.name] : []);
}

/* A turn fills the strip phase by phase; a phase walks along it one at a time; a phase's own term lights only that phase. */
function TurnVisual() {
  const term = useTeachingTerm();
  const walking = term === 'turn' || term === 'phase';
  const step = useTeachingStep(walking, term === 'turn' ? PHASES.length + 2 : PHASES.length, 600);
  const lit = litPhases(term, Math.min(step, PHASES.length - 1));
  return (
    <ol className={styles.phases} data-demonstrating={lit.size > 0 || undefined}>
      {PHASES.map((phase) => (
        <li key={phase.name} className={styles.phase} data-lit={lit.has(phase.name) || undefined}>
          {'ring' in phase ? (
            <span className={styles.ring}>
              <Glyph src={phase.icon} />
            </span>
          ) : (
            <Glyph src={phase.icon} />
          )}
          {'anchor' in phase ? <a href={`#${phase.anchor}`}>{phase.name}</a> : <span>{phase.name}</span>}
        </li>
      ))}
    </ol>
  );
}

/* The wheel sets its cards 62px above its face; the tilted cards reach a further 14px. */
const WHEEL = { width: 170, cardRoom: 76 };

function WheelCard({ front }: { front: (typeof treacheryCardFixtures)[keyof typeof treacheryCardFixtures] }) {
  return (
    <span className={styles.wheelCard}>
      <CanvasScale canvasWidth={card.width} canvasHeight={card.height}>
        <TreacheryCard {...front} />
      </CanvasScale>
    </span>
  );
}

function DuncanIdaho() {
  return (
    <LeaderToken
      background={atreides.background}
      image="/image/leader/official/duncan.png"
      logo="/vector/logo/atreides.svg"
      name="Duncan Idaho"
      strength="2"
    />
  );
}

/*
 * The wheel draws at its native 170px and scales to the column, with room above it for the plan's cards.
 * Demonstrating the battle reveal, it turns from its hidden side to the plan and back, playing the wheel's own reveal.
 */
function Wheel() {
  const revealing = useTeachingTerm() === 'battle-reveal';
  const hidden = useTeachingStep(revealing, 2, 1800) === 0 && revealing;
  return (
    <div className={styles.wheel}>
      <CanvasScale canvasWidth={WHEEL.width} canvasHeight={WHEEL.width + WHEEL.cardRoom}>
        <div style={{ paddingTop: WHEEL.cardRoom }}>
          {hidden ? (
            <BattleWheel
              state="unrevealed"
              label="An Atreides battle wheel before the reveal"
              artwork={atreides}
              motion
            />
          ) : (
            <BattleWheel
              state="revealed"
              label="An Atreides battle plan on the battle wheel"
              background={atreides.background}
              strength={4}
              spice={3}
              adjustment={0}
              troops={[{ id: 'regular', name: 'Troops', dialed: 3, undialed: 2, artwork: atreidesTroop }]}
              cards={[
                <WheelCard key="weapon" front={treacheryCardFixtures.maulaPistol} />,
                <WheelCard key="defense" front={treacheryCardFixtures.shield} />,
              ]}
              leaders={[
                <div key="duncan" className={styles.wheelLeader}>
                  <Disc>
                    <DuncanIdaho />
                  </Disc>
                </div>,
              ]}
              motion={revealing}
            />
          )}
        </div>
      </CanvasScale>
    </div>
  );
}

/* A battle plan is put together piece by piece: the leader, the weapon and defense, the dialed troops, their support, then the whole wheel. */
const PLAN_ORDER = ['leader', 'cards', 'dialed', 'supported', 'wheel'] as const;

function BattleVisual() {
  const term = useTeachingTerm();
  const planning = term === 'battle-plan';
  const step = useTeachingStep(planning, PLAN_ORDER.length + 1, 900);
  const built = PLAN_ORDER.slice(0, Math.min(step, PLAN_ORDER.length - 1) + 1);
  const planLit = (piece: (typeof PLAN_ORDER)[number]) => (planning ? built.includes(piece) : undefined);
  return (
    <div className={styles.column}>
      <Piece
        caption="Battle wheel"
        anchor="battle-wheel"
        lit={planLit('wheel') ?? (term === 'battle-reveal' ? true : undefined)}
      >
        <Wheel />
      </Piece>
      <div className={clsx(styles.grid, styles.extra)}>
        <Piece caption="Dialed troops" anchor="dialed" lit={planLit('dialed')}>
          <span className={styles.troopStack}>
            {[0, 1, 2].map((index) => (
              <Disc key={index} troop>
                <TroopToken {...atreidesTroop} />
              </Disc>
            ))}
          </span>
        </Piece>
        <Piece caption="Supported with 3 spice" anchor="supported" lit={planLit('supported')}>
          <SpicePile count={3} arriving />
        </Piece>
        <Piece caption="Battle plan: leader" anchor="battle-plan" lit={planLit('leader')}>
          <Disc>
            <DuncanIdaho />
          </Disc>
        </Piece>
        <Piece caption="Battle plan: weapon and defense" anchor="battle-plan" lit={planLit('cards')}>
          <span className={styles.pair}>
            <GameCard>
              <TreacheryCard {...treacheryCardFixtures.maulaPistol} />
            </GameCard>
            <GameCard>
              <TreacheryCard {...treacheryCardFixtures.shield} />
            </GameCard>
          </span>
        </Piece>
      </div>
    </div>
  );
}

function SpicePile({ count, arriving = false }: { count: number; arriving?: boolean }) {
  return (
    <span className={clsx(styles.spicePile, arriving && styles.arriving)}>
      {Array.from({ length: count }, (_, index) => (
        <img key={index} className={styles.spiceToken} src={SPICE_TOKEN_HREF} alt="" />
      ))}
    </span>
  );
}

function BoardVisual() {
  return (
    <div className={styles.board}>
      <BoardTeaching />
    </div>
  );
}

function SpiceVisual() {
  return (
    <div className={styles.row}>
      <Piece caption="Spice card" anchor="spice-card">
        <GameCard>
          <SpiceCard name="Arsunt" subName="Spice mine" icon="spice-mine" highlights={['arsunt']} amount={3} />
        </GameCard>
      </Piece>
      <div className={clsx(styles.column, styles.extra)}>
        <Piece caption="Spice Bank" anchor="spice-bank">
          <SpicePile count={6} />
        </Piece>
        <Piece caption="Spice reserve" anchor="spice-reserve">
          <span className={styles.reserve}>
            <Disc>
              <Token {...atreides} />
            </Disc>
            <SpicePile count={2} />
          </span>
        </Piece>
      </div>
    </div>
  );
}

function CardsVisual() {
  return (
    <div className={styles.column}>
      <div className={styles.fan}>
        <Piece captionHidden caption="Treachery card" anchor="treachery-card">
          <GameCard>
            <TreacheryCard {...treacheryCardFixtures.lasgun} />
          </GameCard>
        </Piece>
        <Piece captionHidden caption="Karama" anchor="karama">
          <GameCard>
            <TreacheryCard {...treacheryCardFixtures.karama} />
          </GameCard>
        </Piece>
        <Piece captionHidden caption="Traitor card" anchor="traitor-card">
          <GameCard>
            <TraitorCard
              background={atreides.background}
              image="/image/leader/official/gurney.png"
              logo="/vector/logo/atreides.svg"
              name="Gurney Halleck"
              strength="4"
              owner="Atreides"
            />
          </GameCard>
        </Piece>
      </div>
      <div className={styles.row}>
        <Piece captionHidden caption="Spice card" anchor="spice-card">
          <GameCard>
            <SpiceCard name="Arsunt" subName="Spice mine" icon="spice-mine" highlights={['arsunt']} amount={3} />
          </GameCard>
        </Piece>
        <Piece captionHidden caption="Shai-Hulud" anchor="shai-hulud">
          <GameCard>
            <TreacheryCard {...treacheryCardFixtures.shaiHulud} />
          </GameCard>
        </Piece>
      </div>
    </div>
  );
}

const BASE_FACTIONS = ['atreides', 'harkonnen', 'emperor', 'fremen', 'guild', 'beneGesserit'] as const;

/* An alliance pairs two factions; a faction term walks through the six base factions one at a time. */
const ALLIES = new Set(['atreides', 'fremen']);

function FactionsVisual() {
  const term = useTeachingTerm();
  const step = useTeachingStep(term === 'faction', BASE_FACTIONS.length, 700);
  const lit = (faction: (typeof BASE_FACTIONS)[number], index: number) => {
    if (term === 'faction') {
      return index === step;
    }
    return term === 'alliance' && ALLIES.has(faction);
  };
  return (
    <div
      className={styles.factions}
      data-demonstrating={term === 'faction' || term === 'alliance' || undefined}
      data-allied={term === 'alliance' || undefined}
    >
      {BASE_FACTIONS.map((faction, index) => (
        <span key={faction} className={styles.faction} data-lit={lit(faction, index) || undefined}>
          <Disc>
            <Token {...factionTokenFixtures[faction]} />
          </Disc>
        </span>
      ))}
    </div>
  );
}

/* A bribe on the table: while it is demonstrated, the spice crosses token by token from the paying faction to the receiving one. */
const BRIBE_SPICE = 3;

function DealsVisual() {
  const term = useTeachingTerm();
  const moved = useTeachingStep(demonstrates(term, 'bribe'), BRIBE_SPICE + 2, 650);
  return (
    <Piece caption="Bribe" anchor="bribe">
      <span className={styles.deal}>
        <Disc>
          <Token {...factionTokenFixtures.harkonnen} />
        </Disc>
        <span className={styles.bribeLane}>
          {Array.from({ length: BRIBE_SPICE }, (_, index) => (
            <img
              key={index}
              className={clsx(styles.spiceToken, styles.bribeSpice)}
              style={{ top: `${index * 22}%` }}
              data-moved={index < moved || undefined}
              src={SPICE_TOKEN_HREF}
              alt=""
            />
          ))}
        </span>
        <Disc>
          <Token {...factionTokenFixtures.atreides} />
        </Disc>
      </span>
    </Piece>
  );
}

const VISUALS: Record<GlossaryTopic, () => ReactNode> = {
  pieces: PiecesVisual,
  turn: TurnVisual,
  battle: BattleVisual,
  board: BoardVisual,
  spice: SpiceVisual,
  cards: CardsVisual,
  factions: FactionsVisual,
  deals: DealsVisual,
};

/** The picture beside one glossary topic, drawn with the game's own artwork and sized to fill its column. */
export function TopicVisual({ topic }: { topic: GlossaryTopic }) {
  const Visual = VISUALS[topic];
  const term = useTeachingTerm();
  return (
    <div className={styles.stage} data-term={term ?? undefined}>
      <Visual />
    </div>
  );
}
