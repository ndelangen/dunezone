import { useEffect, useRef, useState } from 'react';

import { phaseOver, seatOf, shortName, toBid } from './auction';
import type { AuctionGame } from './auction';
import {
  AuctionHeader,
  BidPad,
  bidToBeat,
  callSentence,
  CardUp,
  PhaseOver,
  ResultLine,
  SeatToken,
  useAuctioneerVoice,
} from './AuctionParts';
import styles from './Bidding.module.css';
import { useAuctionGame } from './useAuctionGame';
import type { AuctionSession } from './useAuctionGame';

/*
 * Prototype B, a phone for every player: each player joins the table's auction on their own phone (a code or a QR on
 * the table screen) and bids there, in private, with a buzz when it is their turn. A tablet or the living-room TV shows
 * the auction to everyone. Real phones need the auction shared between devices (a Convex room); this prototype runs
 * the table screen and every phone side by side on one shared auction, to try the flow.
 */
export function PhonesAtTheTable({ storageKey, initial }: Readonly<{ storageKey: string; initial: AuctionGame }>) {
  const session = useAuctionGame(storageKey, initial);
  return (
    <div className={styles.devices}>
      <div className={styles.screenFrame} aria-label="The table screen">
        <TableScreen session={session} />
      </div>
      <ul className={styles.phoneRow} aria-label="Every player’s phone">
        {session.game.seats.map((seat) => (
          <li key={seat.faction.id} className={styles.phoneFrame}>
            <BidderPhone session={session} factionId={seat.faction.id} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The screen everyone sees: the card, whose bid it is, and the bid to beat; nobody bids on it. */
export function TableScreen({ session }: Readonly<{ session: AuctionSession }>) {
  const { game } = session;
  const [voice, setVoice] = useState(false);
  useAuctioneerVoice(game, voice);
  const turn = seatOf(game, toBid(game));
  return (
    <div className={styles.tool}>
      <AuctionHeader session={session} voice={voice} onVoice={setVoice} />
      <main className={styles.screenBody}>
        <div className={styles.screenStage}>
          <CardUp game={game} size={150} />
          <div className={styles.screenCall}>
            {turn ? (
              <>
                <SeatToken game={game} seat={turn} size={96} showHand={false} />
                <p className={styles.bigCall}>{shortName(turn.faction)} to bid</p>
                <p className={styles.toBeat}>{bidToBeat(game)}</p>
              </>
            ) : null}
            <PhaseOver session={session} />
          </div>
        </div>
        <ol className={styles.screenSeats} aria-label="The table in storm order">
          {game.seats.map((seat) => (
            <li key={seat.faction.id}>
              <SeatToken game={game} seat={seat} size={44} />
            </li>
          ))}
        </ol>
        <ResultLine game={game} />
      </main>
    </div>
  );
}

/** One player's phone: their own faction, what the table waits on, and the bid pad only when it is their bid. */
export function BidderPhone({ session, factionId }: Readonly<{ session: AuctionSession; factionId: string }>) {
  const { game } = session;
  const seat = seatOf(game, factionId)!;
  const mine = toBid(game) === factionId;
  /* A buzz in the pocket when the auction comes to this player, where the phone can. */
  const was = useRef(mine);
  useEffect(() => {
    if (mine && !was.current) {
      navigator.vibrate?.(120);
    }
    was.current = mine;
  }, [mine]);
  const full = seat.hand >= seat.limit;
  return (
    <div className={styles.phone} data-mine={mine || undefined} aria-label={`${seat.faction.name}’s phone`}>
      <div className={styles.phoneHead}>
        <SeatToken game={game} seat={seat} size={36} showHand={false} />
        <span>
          <strong>{shortName(seat.faction)}</strong>
          <small className={styles.muted}>
            {seat.hand} of {seat.limit} cards
          </small>
        </span>
      </div>
      {phaseOver(game) ? (
        <p className={styles.phoneWait}>Bidding is over.</p>
      ) : mine ? (
        <>
          <p className={styles.phoneYours}>Your bid</p>
          <p className={styles.muted}>{bidToBeat(game)}</p>
          <BidPad session={session} big />
        </>
      ) : (
        <p className={styles.phoneWait}>{full ? 'Your hand is full: you sit this one out.' : callSentence(game)}</p>
      )}
    </div>
  );
}
