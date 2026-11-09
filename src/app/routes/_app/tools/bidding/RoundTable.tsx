import { useState } from 'react';
import type { CSSProperties } from 'react';

import { useMotionAllowed } from '@app/styles/motion';

import { shortName, toBid } from './auction';
import type { AuctionGame } from './auction';
import {
  AuctionHeader,
  BidPad,
  bidToBeat,
  CardUp,
  PhaseOver,
  ResultLine,
  SeatToken,
  useAuctioneerVoice,
} from './AuctionParts';
import styles from './Bidding.module.css';
import { useAuctionGame } from './useAuctionGame';

/*
 * Prototype A, the round table: one tablet lies flat in the middle of the table. Every faction has its own edge of the
 * screen, turned to face where it sits, and bids there with a tap. The card up for bid in the middle turns to face
 * whoever's bid it is, so the whole table sees the auction move round like a pointer.
 */
export function RoundTable({ storageKey, initial }: Readonly<{ storageKey: string; initial: AuctionGame }>) {
  const session = useAuctionGame(storageKey, initial);
  const { game } = session;
  const [voice, setVoice] = useState(false);
  useAuctioneerVoice(game, voice);
  const motion = useMotionAllowed();
  const count = game.seats.length;
  const angleOf = (index: number) => (360 / count) * index;
  const turnIndex = game.seats.findIndex((seat) => seat.faction.id === toBid(game));
  /* The middle turns the short way round to the bidder, and keeps turning the same way as the bid goes round. */
  const facing = turnIndex < 0 ? 0 : angleOf(turnIndex);
  return (
    <div className={styles.tool}>
      <AuctionHeader session={session} voice={voice} onVoice={setVoice} />
      <main className={styles.roundStage}>
        <div className={styles.roundTable}>
          {game.seats.map((seat, index) => {
            const turn = index === turnIndex;
            return (
              <section
                key={seat.faction.id}
                className={styles.roundSeat}
                data-turn={turn || undefined}
                style={{ '--angle': `${angleOf(index)}deg` } as CSSProperties}
                aria-label={seat.faction.name}
              >
                <div className={styles.roundSeatHead}>
                  <SeatToken game={game} seat={seat} size={40} />
                  <strong>{shortName(seat.faction)}</strong>
                </div>
                {turn ? <BidPad session={session} quick /> : null}
              </section>
            );
          })}
          <div
            className={styles.roundMiddle}
            data-motion={motion || undefined}
            style={{ '--facing': `${facing}deg` } as CSSProperties}
          >
            <CardUp game={game} size={110} />
            {toBid(game) ? <p className={styles.toBeat}>{bidToBeat(game)}</p> : null}
          </div>
        </div>
        <div className={styles.roundFoot}>
          <ResultLine game={game} />
          <PhaseOver session={session} />
        </div>
      </main>
    </div>
  );
}
