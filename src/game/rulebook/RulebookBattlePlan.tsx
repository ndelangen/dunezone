import type { RulebookResolvedSource } from '@shared/rulebooks/sources';
import { rulebookSourceClipPath } from '@shared/rulebooks/sources';
import type { ComponentProps } from 'react';

import { useAsset } from '../assets/assetRenderMode';
import { BattleWheel } from '../assets/generic/BattleWheel';
import './RulebookRenderer.css';

type Wheel = ComponentProps<typeof BattleWheel>;
type RevealedWheel = Extract<Wheel, { state: 'revealed' }>;
type HiddenWheel = Extract<Wheel, { state: 'unrevealed' }>;

export type RulebookBattleSide = Readonly<{
  name: string;
  role: string;
  artwork: HiddenWheel['artwork'];
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
      {killed ? <strong className="rulebookBattleDeath">Killed</strong> : null}
    </span>
  );
}

function Side({
  side,
  facing,
  showLabel,
}: Readonly<{ side: RulebookBattleSide; facing: 'left' | 'right'; showLabel: boolean }>) {
  return (
    <figure className="rulebookBattleSide" data-facing={facing}>
      <figcaption hidden={!showLabel}>
        <strong>{side.name}</strong>
        <span>{side.role}</span>
      </figcaption>
      <div className="rulebookBattleWheelFrame">
        <div className="rulebookBattleWheelCanvas">
          {side.revealed ? (
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
          ) : (
            <>
              {side.knownCard ? (
                <div className="rulebookBattleKnownCard">
                  <Piece source={side.knownCard} />
                </div>
              ) : null}
              <div className="rulebookBattleHiddenWheel">
                <BattleWheel
                  state="unrevealed"
                  motion={false}
                  label={`${side.name}: battle plan hidden`}
                  artwork={side.artwork}
                  ready={false}
                />
              </div>
            </>
          )}
        </div>
      </div>
      {side.result ? <p className="rulebookBattleSideResult">{side.result}</p> : null}
    </figure>
  );
}

/** Callers supply one moment in a battle; the panel arranges the shared game visuals and its explanation. */
export function RulebookBattlePlan({
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
    <section className="rulebookBattlePanel" aria-label={`Step ${step}: ${title}`}>
      <div className="rulebookBattleScene">
        <div className="rulebookBattleWheels">
          <Side side={left} facing="left" showLabel={showSideLabels} />
          <Side side={right} facing="right" showLabel={showSideLabels} />
        </div>
        <div className="rulebookBattleNarrative">
          <header>
            <span className="rulebookBattleStep">{step}</span>
            <h3>{title}</h3>
          </header>
          <p>{caption}</p>
          {dialogue.map((line, index) => (
            <blockquote className="rulebookBattleSpeech" data-speaker={line.speaker} key={index}>
              <span>{line.speaker === 'left' ? left.name : right.name}</span>
              {line.text}
            </blockquote>
          ))}
          {outcome ? <p className="rulebookBattleOutcome">{outcome}</p> : null}
        </div>
      </div>
    </section>
  );
}
