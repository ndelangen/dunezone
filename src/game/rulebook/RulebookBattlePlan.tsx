import type { RulebookRenderBlockV1 } from '@shared/rulebooks/renderDocument';
import type { RulebookResolvedSource } from '@shared/rulebooks/sources';
import { rulebookSourceClipPath } from '@shared/rulebooks/sources';
import type { ComponentProps } from 'react';

import { useAsset } from '../assets/assetRenderMode';
import { TroopToken } from '../assets/faction/troop/Troop';
import { BattleWheel } from '../assets/generic/BattleWheel';
import { RulebookIllustratedStep } from './RulebookIllustratedStep';

type Wheel = ComponentProps<typeof BattleWheel>;
type RevealedWheel = Extract<Wheel, { state: 'revealed' }>;
type HiddenWheel = Extract<Wheel, { state: 'unrevealed' }>;

export type RulebookBattleSide = Readonly<{
  name: string;
  role: string;
  artwork?: HiddenWheel['artwork'];
  unavailableTroops?: readonly string[];
  uncommittedTroops?: readonly {
    id: string;
    name: string;
    count: number;
    artwork?: ComponentProps<typeof TroopToken>;
  }[];
  plan: Pick<RevealedWheel, 'strength' | 'spice' | 'adjustment' | 'troops'> & {
    leader: RulebookResolvedSource;
    cards: readonly RulebookResolvedSource[];
    leaderKilled?: boolean;
  };
  revealed: boolean;
  knownCard?: RulebookResolvedSource;
  result?: string;
}>;

export type RulebookBattlePlanProps = Readonly<{
  anchor?: string;
  blockId?: string;
  step: string;
  title: string;
  caption: string;
  left: RulebookBattleSide;
  right: RulebookBattleSide;
  dialogue?: readonly { speaker: 'left' | 'right'; text: string }[];
  outcome?: string;
  showSideLabels?: boolean;
}>;

function Piece({ source, killed = false }: Readonly<{ source: RulebookResolvedSource; killed?: boolean }>) {
  const url = useAsset(source.status === 'ready' ? source.imageUrl : '');
  return (
    <span className="rulebookBattlePiece" data-killed={killed || undefined}>
      {source.status === 'ready' ? (
        <img src={url} alt={source.name} style={{ clipPath: rulebookSourceClipPath(source) }} />
      ) : (
        <span>{source.status === 'unselected' ? 'None' : 'Image unavailable'}</span>
      )}
      {killed ? (
        <span className="rulebookBattleDeath" role="img" aria-label="Killed">
          ❌
        </span>
      ) : null}
    </span>
  );
}

function PlanWheel({ side }: Readonly<{ side: RulebookBattleSide }>) {
  if (!side.artwork) {
    return (
      <div className="rulebookBattleMissingFaction">
        <span>Faction artwork unavailable</span>
        {side.revealed ? (
          <span>
            {side.plan.strength} troop strength, {side.plan.spice} spice
          </span>
        ) : null}
      </div>
    );
  }
  if (!side.revealed) {
    return (
      <div className="rulebookBattleHiddenWheel">
        <BattleWheel
          state="unrevealed"
          motion={false}
          label={`${side.name}: battle plan hidden`}
          artwork={side.artwork}
        />
      </div>
    );
  }
  return (
    <BattleWheel
      {...side.plan}
      state="revealed"
      motion={false}
      label={`${side.name}: ${side.plan.strength} troop strength, ${side.plan.spice} spice`}
      background={side.artwork.background}
      cards={side.plan.cards.map((source, index) => (
        <span className="rulebookBattleWheelCard" key={index}>
          <Piece source={source} />
        </span>
      ))}
      leader={<Piece source={side.plan.leader} killed={side.plan.leaderKilled} />}
    />
  );
}

function UncommittedTroops({ side }: Readonly<{ side: RulebookBattleSide }>) {
  return (
    <div className="rulebookBattleUncommitted" aria-label={`${side.name}: uncommitted troops`}>
      <span>Uncommitted:</span>{' '}
      {side.uncommittedTroops?.length ? (
        side.uncommittedTroops.map((troop) => (
          <span className="rulebookBattleUncommittedGroup" key={troop.id}>
            <span className="rulebookBattleUncommittedToken" aria-label={troop.name}>
              {troop.artwork ? <TroopToken {...troop.artwork} /> : '?'}
            </span>{' '}
            <span>{troop.count}</span>{' '}
          </span>
        ))
      ) : (
        <span>0</span>
      )}
    </div>
  );
}

function Side({
  side,
  facing,
  showLabel,
}: Readonly<{ side: RulebookBattleSide; facing: 'left' | 'right'; showLabel: boolean }>) {
  const cardBack = useAsset('/homepage-table/cardback.webp');
  return (
    <figure className="rulebookBattleSide" data-facing={facing}>
      {showLabel ? (
        <figcaption>
          <strong>{side.name}</strong>
          <span>{side.role}</span>
        </figcaption>
      ) : null}
      <div className="rulebookBattleWheelFrame" data-with-uncommitted={side.revealed || undefined}>
        <div className="rulebookBattleWheelCanvas">
          {!side.revealed && side.plan.cards.length > 0 ? (
            <div
              className="rulebookBattleHiddenCards"
              aria-label={`${side.name}: illustrative hidden cards; the opponent does not know their number`}
            >
              {side.plan.cards.map((_, index) => (
                <span className="rulebookBattleWheelCard" key={index}>
                  {index === 0 && side.knownCard ? (
                    <Piece source={side.knownCard} />
                  ) : (
                    <img src={cardBack} alt="Hidden card" />
                  )}
                </span>
              ))}
            </div>
          ) : null}
          <PlanWheel side={side} />
        </div>
      </div>
      {side.revealed ? <UncommittedTroops side={side} /> : null}
      {side.revealed && side.unavailableTroops?.map((text, index) => <p key={index}>{text}</p>)}
      {side.result ? <p className="rulebookBattleSideResult">{side.result}</p> : null}
    </figure>
  );
}

/** Callers supply one moment in a battle; the panel arranges the shared game visuals and its explanation. */
function RulebookBattlePlan({
  anchor,
  blockId,
  step,
  title,
  caption,
  left,
  right,
  dialogue = [],
  outcome,
  showSideLabels = true,
}: RulebookBattlePlanProps) {
  return (
    <RulebookIllustratedStep
      anchor={anchor}
      blockId={blockId}
      step={step}
      title={title}
      caption={caption}
      dialogue={dialogue.map((line) => ({
        speaker: line.speaker === 'left' ? left.name : right.name,
        text: line.text,
      }))}
      outcome={outcome}
      visual={
        <div className="rulebookBattleWheels">
          <Side side={left} facing="left" showLabel={showSideLabels} />
          <Side side={right} facing="right" showLabel={showSideLabels} />
        </div>
      }
    />
  );
}

type BattleStep = Extract<RulebookRenderBlockV1, { kind: 'battle-step' }>;

function resolvedSide(side: BattleStep['left']): RulebookBattleSide {
  const faction = side.faction.status === 'ready' ? side.faction : undefined;
  const token = faction?.token;
  const unavailableTroops: string[] = [];
  const troops: RevealedWheel['troops'][number][] = [];
  for (const troop of side.troops) {
    const artwork = troop.face === 'back' ? troop.artwork?.back : troop.artwork;
    if (!artwork || !token) {
      unavailableTroops.push(
        `Troop artwork unavailable: ${troop.supported} supported, ${troop.unsupported} unsupported.`
      );
      continue;
    }
    troops.push({
      id: troop.id,
      name: artwork.name,
      dialed: troop.supported,
      undialed: troop.unsupported,
      artwork: {
        background: token.background,
        image: artwork.image,
        star: artwork.star,
        hue: artwork.hue,
        striped: artwork.striped,
      },
    });
  }
  return {
    name: faction?.name ?? 'Faction unavailable',
    role: side.role,
    artwork: token,
    unavailableTroops,
    uncommittedTroops: side.troops
      .filter((troop) => troop.uncommitted > 0)
      .map((troop) => {
        const rendered = troops.find(({ id }) => id === troop.id);
        return {
          id: troop.id,
          count: troop.uncommitted,
          name: rendered?.name ?? 'Troop artwork unavailable',
          artwork: rendered?.artwork,
        };
      }),
    revealed: side.revealed,
    knownCard: side.knownCard,
    result: side.result,
    plan: {
      strength: side.dial,
      spice: side.spice,
      adjustment: side.adjustment ?? 0,
      troops,
      leader: side.leader,
      cards: side.cards,
      leaderKilled: side.leaderKilled,
    },
  };
}

/** Resolves a saved teaching step into the same battle wheels used at the game table. */
export function RulebookBattleStep({ block }: Readonly<{ block: BattleStep }>) {
  return (
    <RulebookBattlePlan
      {...block}
      blockId={block.id}
      left={resolvedSide(block.left)}
      right={resolvedSide(block.right)}
    />
  );
}

/** Callers supply two independent examples; equal columns separate them from a numbered sequence. */
function RulebookBattleComparison({ examples }: Readonly<{ examples: readonly [BattleStep, BattleStep] }>) {
  return (
    <div className="rulebookBattleComparison">
      {examples.map((example) => (
        <section key={example.id} aria-label={example.title}>
          <h3>{example.title}</h3>
          <div className="rulebookBattleWheels">
            <Side side={resolvedSide(example.left)} facing="left" showLabel={example.showSideLabels !== false} />
            <Side side={resolvedSide(example.right)} facing="right" showLabel={example.showSideLabels !== false} />
          </div>
          <p>{example.caption}</p>
          {example.dialogue?.map((line, index) => (
            <blockquote className="rulebookBattleSpeech" key={index}>
              <span>{resolvedSide(line.speaker === 'left' ? example.left : example.right).name}:</span> {line.text}
            </blockquote>
          ))}
          {example.outcome ? <p className="rulebookBattleOutcome">{example.outcome}</p> : null}
        </section>
      ))}
    </div>
  );
}

/** Saved comparisons give each independent example a stable identity within the parent block. */
export function RulebookBattleComparisonBlock({
  block,
}: Readonly<{ block: Extract<RulebookRenderBlockV1, { kind: 'battle-comparison' }> }>) {
  const examples = block.examples.map((example, index) => ({
    ...example,
    id: `${block.id}-${index + 1}`,
    kind: 'battle-step' as const,
  })) as [BattleStep, BattleStep];
  return (
    <section id={block.anchor} data-rulebook-block-anchor={block.anchor} data-rulebook-block-id={block.id}>
      <RulebookBattleComparison examples={examples} />
    </section>
  );
}
