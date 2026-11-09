import { LabeledAction } from '@ui/control/LabeledAction';
import { Hand } from 'lucide-react';
import { useState } from 'react';

import { phaseOver, seatOf, shortName, toBid } from './auction';
import type { AuctionGame } from './auction';
import { AuctionHeader, BidPad, bidToBeat, CardUp, PhaseOver, ResultLine, SeatToken } from './AuctionParts';
import styles from './Bidding.module.css';
import { useAuctionGame } from './useAuctionGame';

/*
 * Prototype D, pass the phone: one phone goes round the table like the bidding does. It shows big who it is for
 * ("Hand it to Fremen"), the player takes it, taps to say they have it, bids or passes, and hands it on. No accounts, no
 * network, and the phone in your hand is the turn marker: you cannot bid out of turn, because you are not holding it.
 */
export function PassThePhone({ storageKey, initial }: Readonly<{ storageKey: string; initial: AuctionGame }>) {
  const session = useAuctionGame(storageKey, initial);
  const { game } = session;
  /* Which bid the phone was last taken up for: the hand-over shows again each time the bid moves on. */
  const [holding, setHolding] = useState<string | undefined>(undefined);
  const turn = seatOf(game, toBid(game));
  const handKey = `${game.turn}:${game.card}:${game.bidding.round}:${turn?.faction.id}:${game.bidding.bid?.amount ?? 0}:${game.bidding.passed.length}`;
  const held = holding === handKey;
  return (
    <div className={styles.tool}>
      <AuctionHeader session={session} />
      <main className={styles.passBody}>
        {phaseOver(game) ? (
          <PhaseOver session={session} />
        ) : turn && !held ? (
          <button type="button" className={styles.handOver} onClick={() => setHolding(handKey)}>
            <span className={styles.muted}>Hand the phone to</span>
            <SeatToken game={game} seat={turn} size={160} showHand={false} />
            <strong className={styles.hugeCall}>{shortName(turn.faction)}</strong>
            <span className={styles.bigBeat}>{bidToBeat(game)}</span>
            <span className={styles.tapHint}>
              <Hand size={18} aria-hidden /> {shortName(turn.faction)}, tap to bid
            </span>
          </button>
        ) : turn ? (
          <div className={styles.passTurn}>
            <div className={styles.passWho}>
              <SeatToken game={game} seat={turn} size={56} />
              <span>
                <strong>{shortName(turn.faction)}, your bid</strong>
                <small className={styles.muted}>{bidToBeat(game)}</small>
              </span>
            </div>
            <CardUp game={game} size={140} />
            <BidPad session={session} big />
            <LabeledAction size="sm" icon={<Hand size={16} />} onClick={() => setHolding(undefined)}>
              Not me, hand it back
            </LabeledAction>
          </div>
        ) : null}
        <ResultLine game={game} />
      </main>
    </div>
  );
}
