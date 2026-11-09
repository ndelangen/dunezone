import { IconAction } from '@ui/control/IconAction';
import { Pause, Play } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';

import { pass, phaseOver, seatOf, shortName, toBid } from './auction';
import type { AuctionGame } from './auction';
import { AuctionHeader, BidPad, bidToBeat, PhaseOver, ResultLine, SeatToken, useAuctioneerVoice } from './AuctionParts';
import styles from './Bidding.module.css';
import { useAuctionGame } from './useAuctionGame';

/*
 * Prototype E, the gavel clock: the table bids out loud with real spice, as it always has; the phone lies in the
 * middle as the auction's clock and memory. A ring drains around the bidder's token for 15 seconds; anyone taps the
 * amount said, or Pass. When the ring runs out the bidder has passed, so slow tables keep moving, just as Play's
 * timed bidding does online.
 */

export const BID_SECONDS = 15;

export function GavelClock({
  storageKey,
  initial,
  seconds = BID_SECONDS,
}: Readonly<{ storageKey: string; initial: AuctionGame; seconds?: number }>) {
  const session = useAuctionGame(storageKey, initial);
  const { game } = session;
  const [voice, setVoice] = useState(false);
  useAuctioneerVoice(game, voice);
  const [running, setRunning] = useState(true);
  const turn = seatOf(game, toBid(game));
  /* The clock starts over for every new bid to answer. */
  const key = `${game.turn}:${game.card}:${turn?.faction.id}:${game.bidding.bid?.amount ?? 0}:${game.bidding.passed.length}`;
  const [left, setLeft] = useState(seconds * 1000);
  /* The time used on this bid so far, kept across a pause; a new bid starts it from nothing. */
  const used = useRef({ key, ms: 0 });
  if (used.current.key !== key) {
    used.current = { key, ms: 0 };
  }
  useEffect(() => {
    setLeft(seconds * 1000 - used.current.ms);
    if (!running || !turn) {
      return;
    }
    const from = performance.now() - used.current.ms;
    const timer = setInterval(() => {
      used.current = { key, ms: Math.min(seconds * 1000, performance.now() - from) };
      const remaining = seconds * 1000 - used.current.ms;
      setLeft(remaining);
      if (remaining <= 0) {
        clearInterval(timer);
        session.act(pass);
      }
    }, 100);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the clock restarts on a new bid or a resume, not each tick
  }, [running, key]);

  const fraction = left / (seconds * 1000);
  return (
    <div className={styles.tool}>
      <AuctionHeader session={session} voice={voice} onVoice={setVoice}>
        <IconAction
          label={running ? 'Pause the clock' : 'Run the clock'}
          emphasis="quiet"
          intent="neutral"
          pressed={!running}
          icon={running ? <Pause size={20} /> : <Play size={20} />}
          onClick={() => setRunning(!running)}
        />
      </AuctionHeader>
      <main className={styles.clockBody}>
        {turn ? (
          <>
            <div
              className={styles.clock}
              data-low={fraction < 0.34 || undefined}
              style={{ '--left': fraction } as CSSProperties}
              role="timer"
              aria-label={`${Math.ceil(left / 1000)} seconds for ${shortName(turn.faction)}`}
            >
              <SeatToken game={game} seat={turn} size={150} showHand={false} />
              <span className={styles.clockSeconds}>{Math.ceil(left / 1000)}</span>
            </div>
            <p className={styles.hugeCall}>{shortName(turn.faction)}</p>
            <p className={styles.bigBeat}>{bidToBeat(game)}</p>
            <ol className={styles.clockSeats} aria-label="The table in storm order">
              {game.seats.map((seat) => (
                <li key={seat.faction.id}>
                  <SeatToken game={game} seat={seat} size={34} />
                </li>
              ))}
            </ol>
            <p className={styles.muted}>Tap what {shortName(turn.faction)} says:</p>
            <BidPad session={session} quick big />
          </>
        ) : null}
        {phaseOver(game) ? <PhaseOver session={session} /> : null}
        <ResultLine game={game} />
      </main>
    </div>
  );
}
