import type { GlossaryTopic } from '@shared/glossary/terms';
import { RULEBOOK_BOARD_DEFINITIONS } from '@shared/rulebooks/boardDefinitions';
import { CanvasScale } from '@ui/layout/CanvasScale';
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

import styles from './TopicVisual.module.css';

const atreides = factionTokenFixtures.atreides;

const atreidesTroop = {
  background: atreides.background,
  image: '/vector/troop/atreides.svg',
  star: undefined,
  hue: undefined,
  striped: undefined,
} as const;

/** How the pictures fill their column; the preview compares them before one is kept. */
export type GlossaryLook = 'fill' | 'tall' | 'lead';

/* A piece of game artwork with the glossary word under it, linking to that word's entry. */
function Piece({ caption, anchor, children }: { caption: string; anchor: string; children: ReactNode }) {
  return (
    <a className={styles.piece} href={`#${anchor}`}>
      <span className={styles.art} aria-hidden="true">
        {children}
      </span>
      <span className={styles.caption}>{caption}</span>
    </a>
  );
}

function Disc({ children }: { children: ReactNode }) {
  return (
    <span className={styles.disc}>
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
  { name: 'CHOAM Charity', icon: '/vector/icon/spice-alt.svg' },
  { name: 'Bidding', icon: '/vector/icon/bidding_disc.svg', anchor: 'bidding' },
  { name: 'Revival', icon: '/vector/icon/revival.svg', anchor: 'revival' },
  { name: 'Shipment and Movement', icon: '/vector/icon/shipment_disc.svg', anchor: 'shipment-and-movement' },
  { name: 'Battle', icon: '/vector/icon/combat_disc.svg', anchor: 'battle' },
  { name: 'Spice Collection', icon: '/vector/icon/collection_disc.svg', anchor: 'spice-collection' },
  { name: 'Mentat Pause', icon: '/vector/icon/mentat.svg' },
] as const;

function PiecesVisual({ look }: { look: GlossaryLook }) {
  return (
    <div className={styles.row}>
      <Piece caption="Troop" anchor="troop">
        <Disc>
          <TroopToken
            background={atreides.background}
            image="/vector/troop/atreides.svg"
            star={undefined}
            hue={undefined}
            striped={undefined}
          />
        </Disc>
      </Piece>
      <Piece caption="Elite troop" anchor="elite-troop">
        <Disc>
          <TroopToken
            background={backgroundPresets.fremen}
            image="/vector/troop/fremen.svg"
            star="/vector/troop_modifier/star-left-red.svg"
            hue={undefined}
            striped={undefined}
          />
        </Disc>
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
      {look === 'tall' ? (
        <>
          <Piece caption="Reserves" anchor="reserves">
            <span className={styles.troopStack}>
              {[0, 1, 2].map((index) => (
                <Disc key={index}>
                  <TroopToken {...atreidesTroop} />
                </Disc>
              ))}
            </span>
          </Piece>
          <Piece caption="Tleilaxu Tanks" anchor="tleilaxu-tanks">
            <span className={styles.tanked}>
              <Disc>
                <TroopToken {...atreidesTroop} />
              </Disc>
            </span>
          </Piece>
        </>
      ) : null}
    </div>
  );
}

function TurnVisual() {
  return (
    <ol className={styles.phases}>
      {PHASES.map((phase, index) => (
        <li key={phase.name} className={styles.phase}>
          <span className={styles.phaseNumber} aria-hidden="true">
            {index + 1}
          </span>
          <Glyph src={phase.icon} />
          {'anchor' in phase ? <a href={`#${phase.anchor}`}>{phase.name}</a> : <span>{phase.name}</span>}
        </li>
      ))}
    </ol>
  );
}

const WHEEL = { width: 170, cardRoom: 62 };

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

/* The wheel draws at its native 170px and scales to the column, with room above it for the plan's cards. */
function Wheel() {
  return (
    <div className={styles.wheel}>
      <CanvasScale canvasWidth={WHEEL.width} canvasHeight={WHEEL.width + WHEEL.cardRoom}>
        <div style={{ paddingTop: WHEEL.cardRoom }}>
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
            leader={
              <div className={styles.wheelLeader}>
                <Disc>
                  <DuncanIdaho />
                </Disc>
              </div>
            }
            motion={false}
          />
        </div>
      </CanvasScale>
    </div>
  );
}

function BattleVisual({ look }: { look: GlossaryLook }) {
  if (look !== 'tall') {
    return <Wheel />;
  }
  return (
    <div className={styles.column}>
      <a className={styles.piece} href="#battle-wheel">
        <Wheel />
        <span className={styles.caption}>Battle wheel</span>
      </a>
      <div className={styles.grid}>
        <Piece caption="Dialed: 3 troops" anchor="dialed">
          <span className={styles.troopStack}>
            {[0, 1, 2].map((index) => (
              <Disc key={index}>
                <TroopToken {...atreidesTroop} />
              </Disc>
            ))}
          </span>
        </Piece>
        <Piece caption="Supported with 3 spice" anchor="supported">
          <SpicePile count={3} />
        </Piece>
        <Piece caption="Battle plan: leader" anchor="battle-plan">
          <Disc>
            <DuncanIdaho />
          </Disc>
        </Piece>
        <Piece caption="Battle plan: weapon and defense" anchor="battle-plan">
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

function SpicePile({ count }: { count: number }) {
  return (
    <span className={styles.spicePile}>
      {Array.from({ length: count }, (_, index) => (
        <Glyph key={index} src="/vector/icon/spice.svg" />
      ))}
    </span>
  );
}

const board = RULEBOOK_BOARD_DEFINITIONS[0]!;

function BoardVisual() {
  return (
    <img
      className={styles.board}
      src={board.imageUrl}
      alt="The board of Arrakis, divided into sectors and territories"
    />
  );
}

function SpiceVisual({ look }: { look: GlossaryLook }) {
  return (
    <div className={styles.row}>
      <Piece caption="Spice card" anchor="spice-card">
        <GameCard>
          <SpiceCard name="Arsunt" subName="Spice mine" icon="spice-mine" highlights={['arsunt']} amount={3} />
        </GameCard>
      </Piece>
      {look === 'tall' ? (
        <div className={styles.column}>
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
      ) : (
        <Piece caption="Spice" anchor="spice">
          <SpicePile count={3} />
        </Piece>
      )}
    </div>
  );
}

function CardsVisual() {
  return (
    <div className={styles.fan}>
      <Piece caption="Treachery card" anchor="treachery-card">
        <GameCard>
          <TreacheryCard {...treacheryCardFixtures.lasgun} />
        </GameCard>
      </Piece>
      <Piece caption="Karama" anchor="karama">
        <GameCard>
          <TreacheryCard {...treacheryCardFixtures.karama} />
        </GameCard>
      </Piece>
      <Piece caption="Traitor card" anchor="traitor-card">
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
  );
}

const BASE_FACTIONS = ['atreides', 'harkonnen', 'emperor', 'fremen', 'guild', 'beneGesserit'] as const;

function FactionsVisual() {
  return (
    <div className={styles.factions}>
      {BASE_FACTIONS.map((faction) => (
        <Disc key={faction}>
          <Token {...factionTokenFixtures[faction]} />
        </Disc>
      ))}
    </div>
  );
}

const VISUALS: Record<GlossaryTopic, (props: { look: GlossaryLook }) => ReactNode> = {
  pieces: PiecesVisual,
  turn: TurnVisual,
  battle: BattleVisual,
  board: BoardVisual,
  spice: SpiceVisual,
  cards: CardsVisual,
  factions: FactionsVisual,
};

/** The picture beside one glossary topic, drawn with the game's own artwork and sized to fill its column. */
export function TopicVisual({ topic, look = 'fill' }: { topic: GlossaryTopic; look?: GlossaryLook }) {
  const Visual = VISUALS[topic];
  return (
    <div className={styles.stage} data-look={look}>
      <Visual look={look} />
    </div>
  );
}
