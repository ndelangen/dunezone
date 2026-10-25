import { emptyBattlePlan, isBattleLeader } from '@shared/play/battle';
import type { BattleFace, BattlePlan, BattlePlanInput, Disclosure } from '@shared/play/battle';
import type { TablePiece } from '@shared/play/model';
import { item } from '@shared/play/setupSupply';
import { PinOff } from 'lucide-react';
import type { ComponentType, CSSProperties, ReactNode } from 'react';
import { useState } from 'react';

import compassStyles from '../compass/CompassControls.module.css';
import { WindowFrame } from '../compass/WindowFrame';
import type { TableWindow } from '../compass/windows';
import { DarkSchemeIsland, darkSchemeIslandAttributes } from '../DarkSchemeIsland';
import { battleStory } from '../playing.stories.fixture';
import { cardBack, factions, playingSnapshot } from '../product.stories.fixture';
import { ModeToggle } from './parts';
import { planLocks } from './planView';
import type { BattlePlanViewProps } from './planView';
import '../dune-play.css';

type Faction = (typeof factions)[number];
const factionBySlug = (slug: string) => factions.find((entry) => entry.slug === slug)!;

/* Battle values as each story faction's troop description states them; the catalogue copy carries no numbers. */
const FACE_VALUES: Readonly<Record<string, readonly Pick<BattleFace, 'strength' | 'supportedStrength'>[]>> = {
  'house-harkonnen': [{ strength: 0.5, supportedStrength: 1 }],
  emperor: [
    { strength: 0.5, supportedStrength: 1 },
    { strength: 1, supportedStrength: 2 },
  ],
};

function facesOf(faction: Faction): BattleFace[] {
  return faction.data.troops.map((troop, index) => ({
    id: `${faction.slug}-troop-${index}`,
    name: troop.name,
    image: troop.image,
    capable: true,
    supportCost: 1,
    ...FACE_VALUES[faction.slug]![index]!,
  }));
}

/* Published Dreamrules Treachery fronts, pulled from production: a weapon of each kind, a defense and a Cheap Hero. */
const TREACHERY = [
  ['crysknife', 'Crysknife'],
  ['chaumas', 'Chaumas'],
  ['shield', 'Shield'],
  ['cheap-hero', 'Cheap Hero'],
] as const;

/** Treachery cards drawn into the hand, each a single card as the loose Snooper on the playing table is. */
function treacheryCards(): TablePiece[] {
  const loose = playingSnapshot('seat-2').table.pieces.find((entry) => entry.id === 'treachery-card-loose')!;
  return TREACHERY.map(([slug, name]) => ({
    ...loose,
    id: `treachery-${slug}`,
    label: name,
    items: [
      item(
        `treachery-${slug}-item`,
        name,
        new URL(`/play-fixtures/dreamrules/${slug}.jpg`, location.origin).href,
        cardBack(),
        'card-treachery',
        true,
        'Treachery'
      ),
    ],
  }));
}

export type Scenario = 'fresh' | 'planned' | 'emperor' | 'ready' | 'countdown';

type Harness = Omit<BattlePlanViewProps, 'onEdit' | 'onReady' | 'onDisclose'>;

/** The viewer's side of the story battle at Arrakeen: Harkonnen against Atreides, or the Emperor in its place. */
export function scenario(name: Scenario): Harness {
  const emperor = name === 'emperor';
  const faction = factionBySlug(emperor ? 'emperor' : 'house-harkonnen');
  const story = battleStory('preparing');
  /* The viewer's own hand from the playing fixture: leaders, alliance card and kept Traitors, and four Treachery cards drawn since. */
  const own = playingSnapshot(emperor ? 'seat-3' : 'seat-2').hand!;
  const hand = [...own, ...treacheryCards()];
  const leaders = own.filter(isBattleLeader);
  const faces = facesOf(faction);
  const plan: BattlePlan = { ...emptyBattlePlan(faces), pieces: [] };
  const leaderStrength = Object.fromEntries(
    leaders.map((leader) => [
      leader.id,
      Number(faction.data.leaders.find((entry) => entry.name === leader.label)?.strength ?? 0),
    ])
  );
  const troopLimit = Object.fromEntries(
    faction.data.troops.map((troop, index) => [faces[index]!.id, Number(troop.count)])
  );
  const harness: Harness = {
    plan,
    hand,
    balance: 10,
    stage: 'preparing',
    ready: false,
    canAct: true,
    territory: story.battle!.territory,
    opponent: { name: factionBySlug('house-atreides').data.name, ready: true },
    leaderStrength,
    troopLimit,
    wheelArt: {
      background: faction.data.background,
      troops: Object.fromEntries(
        faction.data.troops.map(({ image, star, hue, striped }, index) => [
          faces[index]!.id,
          { background: faction.data.background, image, star, hue, striped },
        ])
      ),
      descriptions: Object.fromEntries(
        faction.data.troops.map((troop, index) => [faces[index]!.id, troop.description])
      ),
    },
  };
  if (name === 'fresh') {
    return { ...harness, opponent: { ...harness.opponent!, ready: false } };
  }
  const committed = simulate(harness, {
    leaderId: leaders[0]!.id,
    cardIds: ['treachery-crysknife'],
    ...(emperor
      ? { mode: 'custom' as const }
      : { troops: [{ faceId: faces[0]!.id, undialed: 6, dialed: 0 }], spice: 4 }),
  });
  /* Switching to Custom starts the dial over, so the Emperor's troops are dialed after the switch. */
  const planned = emperor
    ? simulate(committed, {
        troops: [
          { faceId: faces[0]!.id, undialed: 2, dialed: 3 },
          { faceId: faces[1]!.id, undialed: 0, dialed: 2 },
        ],
      })
    : committed;
  if (name === 'ready' || name === 'countdown') {
    return {
      ...planned,
      ready: true,
      stage: name === 'countdown' ? 'countdown' : 'preparing',
      opponent: { ...planned.opponent!, ready: name === 'countdown' },
      plan: { ...planned.plan, disclosed: { leader: false, dial: false, cardIds: [planned.plan.cardIds[0]!] } },
    };
  }
  return planned;
}

/**
 * What the Worker makes of a plan edit, for the story: switching mode starts the dial over, Max supports as many troops as the spice reaches, Custom spends what its supported troops cost, and the committed pieces leave the hand.
 */
function simulate(state: Harness, patch: Partial<BattlePlanInput>): Harness {
  const before = state.plan;
  const input = { ...before, ...patch };
  const available = state.balance + before.spice;
  const faces = new Map(before.faces.filter((face) => face.capable).map((face) => [face.id, face]));
  let troops = input.mode !== before.mode ? [] : input.troops.map((troop) => ({ ...troop }));
  let spice = input.mode !== before.mode ? 0 : input.spice;
  if (input.mode === 'custom') {
    spice = troops.reduce((total, troop) => total + troop.dialed * faces.get(troop.faceId)!.supportCost, 0);
  } else {
    let left = Math.min(spice, available);
    /* The best support per spice first, as the Worker's exact allocation finds for these faces. */
    const order = [...troops].sort((a, b) => gain(faces.get(b.faceId)!) - gain(faces.get(a.faceId)!));
    for (const troop of order) {
      const face = faces.get(troop.faceId)!;
      const total = troop.undialed + troop.dialed;
      troop.dialed = face.supportCost ? Math.min(total, Math.floor(left / face.supportCost)) : total;
      troop.undialed = total - troop.dialed;
      left -= troop.dialed * face.supportCost;
    }
    spice = Math.min(spice, available) - left;
    troops = troops.filter((troop) => troop.undialed + troop.dialed > 0);
  }
  const strength = troops.reduce((total, troop) => {
    const face = faces.get(troop.faceId)!;
    return total + troop.undialed * face.strength + troop.dialed * face.supportedStrength;
  }, input.adjustment);
  const pool = [...state.hand, ...before.pieces];
  const ids = [...(input.leaderId ? [input.leaderId] : []), ...input.cardIds];
  const plan: BattlePlan = {
    ...input,
    troops,
    spice,
    strength,
    pieces: ids.map((id) => pool.find((entry) => entry.id === id)!),
  };
  return {
    ...state,
    plan,
    balance: available - spice,
    hand: pool.filter((entry) => !ids.includes(entry.id)),
  };
}

const gain = (face: BattleFace) => (face.supportedStrength - face.strength) / Math.max(face.supportCost, 0.0001);

function disclose(state: Harness, part: Disclosure, shown: boolean): Harness {
  const disclosed = { ...state.plan.disclosed };
  if (part.element === 'card') {
    disclosed.cardIds = shown
      ? [...disclosed.cardIds, part.cardId]
      : disclosed.cardIds.filter((id) => id !== part.cardId);
  } else {
    disclosed[part.element] = shown;
  }
  return { ...state, plan: { ...state.plan, disclosed } };
}

/** A variant, live: its intents change the story's own plan as the Worker would. */
export function PlanHarness({
  variant: Variant,
  initial,
  size,
}: {
  variant: ComponentType<BattlePlanViewProps>;
  initial: Harness;
  size: SlotSize;
}) {
  const [state, setState] = useState(initial);
  return (
    <SlotFrame
      size={size}
      actions={
        <ModeToggle
          mode={state.plan.mode}
          disabled={planLocks(state).dialLocked}
          onChange={(mode) => setState((before) => simulate(before, { mode }))}
        />
      }
    >
      <Variant
        {...state}
        onEdit={(patch) => setState((before) => simulate(before, patch))}
        onReady={(ready) =>
          setState((before) => ({
            ...before,
            ready,
            stage: ready && before.opponent?.ready ? 'countdown' : 'preparing',
          }))
        }
        onDisclose={(part, shown) => setState((before) => disclose(before, part, shown))}
      />
    </SlotFrame>
  );
}

const BATTLE_WINDOW: Omit<TableWindow, 'content'> = {
  key: 'battle',
  label: 'Battle plan',
  group: 'Table',
  topic: 'battle',
  description: 'Your private plan for the battle on the table.',
  layout: 'stack',
  hero: true,
};

/* Room above the slot for the wheel and its cards, which stand over the window's top edge. */
const HERO_ROOM = 150;

export type SlotSize = 'slot' | 'narrow' | 'wide' | 'tall';
const SLOT_SIZES: Readonly<Record<SlotSize, { width: string; height: string }>> = {
  /* The bottom-left pinned slot as the compass opens it on a laptop table. */
  slot: { width: '389px', height: '414px' },
  narrow: { width: '18rem', height: '28rem' },
  wide: { width: '30rem', height: '28rem' },
  tall: { width: '24rem', height: '34rem' },
};

/** The window as a pinned slot shows it, alone on the table's ground: its real frame, title and (?) included. */
function SlotFrame({ size, actions, children }: { size: SlotSize; actions: ReactNode; children: ReactNode }) {
  const { width, height } = SLOT_SIZES[size];
  return (
    <DarkSchemeIsland>
      <div
        className="dune-play-shell"
        {...darkSchemeIslandAttributes}
        style={{ width: `calc(${width} + 24px)`, height: `calc(${height} + 24px + ${HERO_ROOM}px)` }}
      >
        <div className={compassStyles.root} style={{ '--slot-width': width } as CSSProperties}>
          <WindowFrame
            entry={{ ...BATTLE_WINDOW, content: children }}
            tab="public"
            where="left"
            inert={false}
            style={{ height }}
            onTab={() => undefined}
            actions={
              <>
                {actions}
                <button
                  type="button"
                  className={compassStyles.iconButton}
                  aria-label="Unpin"
                  title="Unpin: it disappears"
                >
                  <PinOff size={16} />
                </button>
              </>
            }
          />
        </div>
      </div>
    </DarkSchemeIsland>
  );
}

export type { Harness };
