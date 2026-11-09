import { Check } from 'lucide-react';
import { useState } from 'react';
import type { ReactNode } from 'react';

import { phaseOver, resultSentence, seatOf, shortName, toBid } from './auction';
import type { AuctionGame } from './auction';
import { AuctionHeader, BidPad, bidToBeat, PhaseOver, SeatToken, useAuctioneerVoice } from './AuctionParts';
import styles from './Bidding.module.css';
import { useAuctionGame } from './useAuctionGame';

/*
 * Prototype F, the referee: the phone reads the Bidding phase as a script, step by step, so a table that half knows the
 * rules plays it right. How many cards to deal and why, who looks first, who opens each card, who pays whom, the bonus
 * card, and what goes back on the deck. The bidding itself is a small pad inside the step it belongs to.
 */
export function RefereeScript({ storageKey, initial }: Readonly<{ storageKey: string; initial: AuctionGame }>) {
  const session = useAuctionGame(storageKey, initial);
  const { game } = session;
  const [voice, setVoice] = useState(false);
  useAuctioneerVoice(game, voice);
  const full = game.seats.filter((seat) => seat.hand >= seat.limit);
  const peeker = game.seats.find((seat) => seat.peeks);
  return (
    <div className={styles.tool}>
      <AuctionHeader session={session} voice={voice} onVoice={setVoice} />
      <main className={styles.scriptBody}>
        <ol className={styles.hands} aria-label="Cards in hand">
          {game.seats.map((seat) => (
            <li key={seat.faction.id}>
              <SeatToken game={game} seat={seat} size={36} />
            </li>
          ))}
        </ol>
        <ol className={styles.script}>
          <Step done title={`Deal ${game.cards} Treachery cards face down in a row`}>
            One for each faction with room in hand
            {full.length
              ? `; ${full.map((seat) => shortName(seat.faction)).join(' and ')} ${full.length > 1 ? 'are' : 'is'} full`
              : ''}
            .
          </Step>
          {Array.from({ length: game.cards }, (_, card) => {
            const result = game.results.find((entry) => entry.card === card);
            const current = card === game.card && !phaseOver(game);
            if (card > game.card && !current) {
              return game.returned > 0 && phaseOver(game) ? null : (
                <Step key={card} title={`Card ${card + 1}`} waiting>
                  Waits its turn.
                </Step>
              );
            }
            if (result) {
              return (
                <Step key={card} done title={`Card ${card + 1}`}>
                  {resultSentence(game, result)}
                </Step>
              );
            }
            if (!current) {
              return null;
            }
            const turn = seatOf(game, toBid(game));
            const opener = seatOf(game, game.opener);
            return (
              <Step key={card} current title={`Card ${card + 1}: bidding`}>
                {peeker ? <span>{shortName(peeker.faction)} looks at the card first. </span> : null}
                {opener ? <span>{shortName(opener.faction)} opens; bidding goes round in storm order. </span> : null}
                {turn ? (
                  <strong className={styles.scriptCall}>
                    {shortName(turn.faction)} to bid · {bidToBeat(game)}
                  </strong>
                ) : null}
                <BidPad session={session} />
              </Step>
            );
          })}
          {phaseOver(game) ? (
            <Step current title="Bidding is over">
              {game.returned > 0
                ? `Put the ${game.returned} unsold ${game.returned === 1 ? 'card' : 'cards'} back on top of the deck.`
                : 'Every card found a buyer.'}
            </Step>
          ) : null}
        </ol>
        <PhaseOver session={session} />
      </main>
    </div>
  );
}

function Step({
  title,
  done = false,
  current = false,
  waiting = false,
  children,
}: Readonly<{ title: string; done?: boolean; current?: boolean; waiting?: boolean; children: ReactNode }>) {
  return (
    <li
      className={styles.step}
      data-done={done || undefined}
      data-current={current || undefined}
      data-waiting={waiting || undefined}
      aria-current={current ? 'step' : undefined}
    >
      <span className={styles.stepMark} aria-hidden>
        {done ? <Check size={14} /> : null}
      </span>
      <div className={styles.stepBody}>
        <strong>{title}</strong>
        <div className={styles.stepText}>{children}</div>
      </div>
    </li>
  );
}
