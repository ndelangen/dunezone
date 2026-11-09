import { Menu } from '@mantine/core';
import { IconAction } from '@ui/control/IconAction';
import { LabeledAction } from '@ui/control/LabeledAction';
import { Stepper } from '@ui/control/Stepper';
import { ArrowRight, Gavel, Hand, RotateCcw, Settings2, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { FactionTokenFace } from '@app/routes/_app/play/multiplayer/FactionTokenFace';
import { useSpeech } from '@app/widgets/tutorial-guide/speech';

import {
  bid,
  highBid,
  leastBid,
  newAuction,
  pass,
  phaseOver,
  resultSentence,
  seatOf,
  shortName,
  startPhase,
  toBid,
} from './auction';
import type { AuctionGame, AuctionSeat } from './auction';
import styles from './Bidding.module.css';
import type { AuctionSession } from './useAuctionGame';

/*
 * The parts every bidding prototype shares: the card up for bid, a seat's token, the bid pad, the line a result asks of
 * the table, and the voice that calls the auction out loud.
 */

/** The card up for bid as the table sees it: the deck's back, which card of how many, and who looks first. */
export function CardUp({ game, size = 120 }: Readonly<{ game: AuctionGame; size?: number }>) {
  const peeker = game.seats.find((seat) => seat.peeks);
  const over = phaseOver(game);
  return (
    <figure className={styles.cardUp} style={{ width: size }}>
      <img
        className={styles.cardBack}
        src={game.deck.back}
        alt={over ? 'No card up for bid' : `Treachery card ${game.card + 1} of ${game.cards}`}
        data-over={over || undefined}
        draggable={false}
      />
      <figcaption className={styles.cardCaption}>
        {over ? 'Bidding is over' : `Card ${game.card + 1} of ${game.cards}`}
        {peeker && !over ? <small>{shortName(peeker.faction)} looks first</small> : null}
      </figcaption>
    </figure>
  );
}

/** One faction at the table: its token, ringed when it is its bid, dimmed when its hand is full. */
export function SeatToken({
  game,
  seat,
  size = 44,
  showHand = true,
}: Readonly<{ game: AuctionGame; seat: AuctionSeat; size?: number; showHand?: boolean }>) {
  const id = seat.faction.id;
  const turn = toBid(game) === id;
  const high = highBid(game)?.factionId === id;
  const full = seat.hand >= seat.limit;
  return (
    <span className={styles.seatToken} data-turn={turn || undefined} data-full={full || undefined}>
      <FactionTokenFace token={seat.faction} size={size} aria-hidden />
      {high ? <span className={styles.highMark}>{highBid(game)!.amount}</span> : null}
      {showHand ? <span className={styles.handCount}>{full ? 'Full' : `${seat.hand}/${seat.limit}`}</span> : null}
    </span>
  );
}

/** The bid to beat, in words: "Fremen has 2", or "No bid yet". */
export function bidToBeat(game: AuctionGame): string {
  const bid = highBid(game);
  if (!bid) {
    return 'No bid yet';
  }
  return `${shortName(seatOf(game, bid.factionId)!.faction)} has ${bid.amount}`;
}

/** What the auctioneer calls out now: whose bid it is and what they must beat, or what the phase ended with. */
export function callSentence(game: AuctionGame): string {
  if (phaseOver(game)) {
    return 'Bidding is over for this turn.';
  }
  const turn = seatOf(game, toBid(game))!;
  const opening = game.bidding.bid === null && game.bidding.passed.length === 0;
  const card = opening ? `Card ${game.card + 1} of ${game.cards}. ` : '';
  const peek = opening && game.seats.some((seat) => seat.peeks) ? `${peekerName(game)}, have a look. ` : '';
  return `${card}${peek}${shortName(turn.faction)}? ${highBid(game) ? `${bidToBeat(game)}.` : 'Open the bidding.'}`;
}

const peekerName = (game: AuctionGame) => shortName(game.seats.find((seat) => seat.peeks)!.faction);

/** The newest card's outcome, as a line the table acts on. */
export function lastResultSentence(game: AuctionGame): string | undefined {
  const result = game.results.at(-1);
  return result ? resultSentence(game, result) : undefined;
}

/** What a finished card asks of the table: who pays whom, who takes the card. Shown until the next card is settled. */
export function ResultLine({ game }: Readonly<{ game: AuctionGame }>) {
  const line = lastResultSentence(game);
  if (!line) {
    return null;
  }
  return (
    <p className={styles.result} role="status">
      <Gavel size={16} aria-hidden />
      {line}
    </p>
  );
}

/**
 * The bid pad for the faction whose bid it is: an amount that starts at the least it may say, Bid and Pass.
 * `big` is the phone in one hand: the amount and the two actions fill the width.
 */
export function BidPad({
  session,
  big = false,
  quick = false,
}: Readonly<{ session: AuctionSession; big?: boolean; quick?: boolean }>) {
  const { game } = session;
  const least = leastBid(game);
  /* Every new bid to beat starts the pad at the least that beats it. */
  const [draft, setDraft] = useState({ least, amount: least });
  const amount = draft.least === least ? draft.amount : least;
  const setAmount = (value: number) => setDraft({ least, amount: value });
  const turn = toBid(game);
  if (turn === null) {
    return null;
  }
  const name = shortName(seatOf(game, turn)!.faction);
  return (
    <div className={styles.bidPad} data-big={big || undefined}>
      {quick ? (
        <div className={styles.quickBids} role="group" aria-label={`Quick bids for ${name}`}>
          {[0, 1, 2, 4].map((step) => (
            <button
              key={step}
              type="button"
              className={styles.quickBid}
              onClick={() => session.act((current) => bidOf(current, least + step))}
            >
              {least + step}
            </button>
          ))}
        </div>
      ) : (
        <Stepper label={`${name}’s bid`} value={amount} min={least} max={99} onChange={setAmount} size="md" />
      )}
      <div className={styles.padActions}>
        {quick ? null : (
          <LabeledAction
            emphasis="strong"
            intent="positive"
            size={big ? 'lg' : 'md'}
            icon={<Gavel size={18} />}
            accessibleName={`${name} bids ${amount}`}
            onClick={() => session.act((current) => bidOf(current, amount))}
          >
            {`Bid ${amount}`}
          </LabeledAction>
        )}
        <LabeledAction
          size={big ? 'lg' : 'md'}
          icon={<Hand size={18} />}
          accessibleName={`${name} passes`}
          onClick={() => session.act(passOf)}
        >
          Pass
        </LabeledAction>
      </div>
      {session.refusal ? <p className={styles.refusal}>{session.refusal}</p> : null}
    </div>
  );
}

/* The bid and pass steps, as the session runs them. */
export const bidOf = (game: AuctionGame, amount: number) => bid(game, amount);
export const passOf = (game: AuctionGame) => pass(game);

/** When the turn's bidding is over: what happened, and the next turn's bidding one tap away. */
export function PhaseOver({ session }: Readonly<{ session: AuctionSession }>) {
  const { game } = session;
  if (!phaseOver(game)) {
    return null;
  }
  const won = game.results.filter((result) => result.faction !== null);
  return (
    <section className={styles.phaseOver} aria-label="Bidding is over">
      <h3 className={styles.phaseTitle}>Turn {game.turn}: bidding is over</h3>
      <ol className={styles.phaseLines}>
        {game.results.map((result) => (
          <li key={result.card}>{resultSentence(game, result)}</li>
        ))}
      </ol>
      <p className={styles.muted}>
        {won.length} of {game.cards} cards sold
        {won.length ? ` for ${won.reduce((sum, result) => sum + result.amount, 0)} spice` : ''}.
      </p>
      <LabeledAction
        emphasis="strong"
        icon={<ArrowRight size={18} />}
        onClick={() => session.act((current) => startPhase(current))}
      >
        {`Bid in turn ${game.turn + 1}`}
      </LabeledAction>
    </section>
  );
}

/** The tool's top line: the turn, the card, and the actions every prototype has (take back, voice, settings). */
export function AuctionHeader({
  session,
  title,
  voice,
  onVoice,
  children,
}: Readonly<{
  session: AuctionSession;
  title?: string;
  voice?: boolean;
  onVoice?: (on: boolean) => void;
  children?: ReactNode;
}>) {
  const { game } = session;
  return (
    <header className={styles.header}>
      <div className={styles.headline}>
        <span className={styles.headTitle}>{title ?? `Turn ${game.turn} · Bidding`}</span>
        <span className={styles.muted}>
          {phaseOver(game) ? 'Over' : `Card ${game.card + 1} of ${game.cards}`} · {game.deck.name}
        </span>
      </div>
      {children}
      <IconAction
        label="Take back"
        tooltip="Take back the last bid or pass"
        emphasis="quiet"
        intent="neutral"
        icon={<RotateCcw size={20} />}
        disabledReason={session.canUndo ? undefined : 'Nothing to take back yet.'}
        onClick={session.undo}
      />
      {onVoice ? (
        <IconAction
          label={voice ? 'Stop calling the auction aloud' : 'Call the auction aloud'}
          emphasis="quiet"
          intent="neutral"
          pressed={Boolean(voice)}
          icon={voice ? <Volume2 size={20} /> : <VolumeX size={20} />}
          onClick={() => onVoice(!voice)}
        />
      ) : null}
      <Menu position="bottom-end" withinPortal>
        <Menu.Target>
          <IconAction label="Auction settings" emphasis="quiet" intent="neutral" icon={<Settings2 size={20} />} />
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Label>Turn {game.turn}</Menu.Label>
          <Menu.Item onClick={() => session.act((current) => startPhase(current, current.turn))}>
            Deal this turn’s cards again
          </Menu.Item>
          <Menu.Item onClick={() => session.restart(newAuction(game.deck, game.seats, 1))}>New game</Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </header>
  );
}

/**
 * The auctioneer's voice: each time the call changes it says the newest result, then whose bid it is.
 * Returns the line it last said, for a caption under the call.
 */
export function useAuctioneerVoice(game: AuctionGame, on: boolean) {
  const speech = useSpeech();
  const said = useRef<string | undefined>(undefined);
  const results = useRef(game.results.length);
  useEffect(() => {
    const result = game.results.length > results.current ? lastResultSentence(game) : undefined;
    results.current = game.results.length;
    const line = [result, callSentence(game)].filter(Boolean).join(' ');
    if (line === said.current) {
      return;
    }
    said.current = line;
    if (on) {
      speech.speak(line);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a new call is what speaks
  }, [game, on]);
  useEffect(() => {
    if (!on) {
      speech.stop();
    }
  }, [on, speech]);
  return speech;
}
