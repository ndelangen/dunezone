import type { ReactNode } from 'react';

import './RulebookRenderer.css';

export type RulebookIllustratedStepProps = Readonly<{
  step: string;
  title: string;
  caption: string;
  visual: ReactNode;
  dialogue?: readonly { speaker: string; text: string }[];
  outcome?: string;
  anchor?: string;
  blockId?: string;
}>;

/** Callers supply one illustrated action; this composition keeps its number and explanation beside the visual. */
export function RulebookIllustratedStep({
  step,
  title,
  caption,
  visual,
  dialogue = [],
  outcome,
  anchor,
  blockId,
}: RulebookIllustratedStepProps) {
  return (
    <section
      id={anchor}
      data-rulebook-block-anchor={anchor}
      data-rulebook-block-id={blockId}
      className="rulebookBattlePanel"
      aria-label={`Step ${step}: ${title}`}
    >
      <div className="rulebookBattleScene">
        {visual}
        <div className="rulebookBattleNarrative">
          <header>
            <span className="rulebookBattleStep">{step}</span>
            <h3>{title}</h3>
          </header>
          {caption ? <p>{caption}</p> : null}
          {dialogue.map((line, index) => (
            <blockquote className="rulebookBattleSpeech" key={index}>
              <span>{line.speaker}:</span> {line.text}
            </blockquote>
          ))}
          {outcome ? <p className="rulebookBattleOutcome">{outcome}</p> : null}
        </div>
      </div>
    </section>
  );
}
