import { Switch } from '@mantine/core';
import { ControlBlock } from '@ui/control/ControlBlock';
import { LabeledAction } from '@ui/control/LabeledAction';
import { Stepper } from '@ui/control/Stepper';
import { Check, Gavel, Hand, Mic, MicOff, Plus, Smartphone, Vibrate } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';

import { useMotionAllowed } from '@app/styles/motion';
import { FactionTokenFace } from '@app/widgets/faction-token/FactionTokenFace';
import type { FactionToken } from '@app/widgets/faction-token/FactionTokenFace';
import { TrackerConfigPanel } from '@app/widgets/treachery-tracker/TrackerConfig';
import type { FactionSearch, TrackerConfig } from '@app/widgets/treachery-tracker/TrackerConfig';

import { DEFAULT_LIMIT, highBid, newAuction, pass, phaseOver, seatOf, shortName, toBid } from './auction';
import type { AuctionGame, AuctionSeat } from './auction';
import { AuctionHeader, bidToBeat, CardUp, PhaseOver, ResultLine, SeatToken, useAuctioneerVoice } from './AuctionParts';
import styles from './Bidding.module.css';
import type { Call, RemoteCommand } from './soundCode';
import { playCall, playTune, useToneListener } from './soundRemote';
import { runRemote } from './SoundRemotes';
import type { HeardLine } from './SoundRemotes';
import { useAuctionGame } from './useAuctionGame';

/*
 * Prototype H, the linked table (Norbert, 2026-11-09): sound remotes with a setup. The tablet in the middle seats the
 * factions with Dune Zone's faction picker, starting from the base six, and each player links their phone as their
 * faction's remote (it plays a join tune). Bidding then goes round in seat order: an arrow on the tablet points at the
 * faction whose bid it is, and the tablet's own tune tells that phone it is its turn, so it buzzes and counts down the
 * bid timer the table set. Still no network: sound both ways.
 */

/** The base game's powers that change an auction, by faction; any other faction bids plainly. */
export function auctionSeat(faction: FactionToken): AuctionSeat {
  const id = faction.id;
  const harkonnen = /harkonnen/.test(id);
  return {
    faction,
    hand: harkonnen ? 2 : 1,
    limit: harkonnen ? 8 : DEFAULT_LIMIT,
    ...(harkonnen ? { bonus: true } : {}),
    ...(/atreides/.test(id) ? { peeks: true } : {}),
    ...(/emperor/.test(id) ? { paid: true } : {}),
  };
}

export type LinkedSetup = Readonly<{ seats: readonly FactionToken[]; seconds: number; ruleset: string }>;

type Props = Readonly<{
  storageKey: string;
  rulesets: readonly { id: string; name: string }[];
  /** The base six, to start the setup from. */
  baseSix: readonly FactionToken[];
  search: FactionSearch;
  deck: AuctionGame['deck'];
  /** Skips the setup: the table as already set up, with these seats' phones linked. */
  started?: Readonly<{ setup: LinkedSetup; linked: readonly number[] }>;
}>;

/** The prototype as a story shows it: the tablet and each player's phone, side by side, hearing each other directly. */
export function LinkedTable(props: Props) {
  const [factions, setFactions] = useState<readonly FactionToken[]>(() => props.started?.setup.seats ?? props.baseSix);
  return (
    <div className={styles.devices}>
      <div className={`${styles.screenFrame} ${styles.tallFrame}`} aria-label="The tablet in the middle">
        <LinkedTablet {...props} loopback onSeats={setFactions} />
      </div>
      <ul className={styles.phoneRow} aria-label="Every player’s phone">
        {factions.map((faction, seat) => (
          <li key={faction.id} className={styles.phoneFrame}>
            <LinkedRemote factions={factions} loopback storySeat={seat} joined={props.started?.linked.includes(seat)} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The tablet: the setup until bidding starts, then the auction with its arrow and clock. */
export function LinkedTablet({
  storageKey,
  rulesets,
  baseSix,
  search,
  deck,
  started,
  loopback = false,
  onSeats,
}: Props & Readonly<{ loopback?: boolean; onSeats?: (seats: readonly FactionToken[]) => void }>) {
  const [setup, setSetup] = useState<LinkedSetup>(
    () => started?.setup ?? { seats: baseSix, seconds: 15, ruleset: rulesets[0]?.id ?? '' }
  );
  const [linked, setLinked] = useState<readonly number[]>(() => started?.linked ?? []);
  const [game, setGame] = useState<AuctionGame | undefined>(() =>
    started ? newAuction(deck, started.setup.seats.map(auctionSeat), 1) : undefined
  );
  const [mic, setMic] = useState(false);
  /* Before bidding, the tablet only listens for phones joining. */
  useToneListener({
    on: game === undefined,
    mic,
    loopback,
    onCommand: (command) => {
      if (command.kind === 'join' && command.seat < setup.seats.length) {
        setLinked((was) => (was.includes(command.seat) ? was : [...was, command.seat]));
      }
    },
  });
  if (game) {
    return (
      <LinkedBidding
        storageKey={storageKey}
        initial={game}
        seconds={setup.seconds}
        linked={linked}
        loopback={loopback}
        mic={mic}
        onMic={setMic}
        onLinked={(seat) => setLinked((was) => (was.includes(seat) ? was : [...was, seat]))}
      />
    );
  }
  const config: TrackerConfig = { ruleset: setup.ruleset, seats: setup.seats };
  return (
    <div className={styles.tool}>
      <header className={styles.header}>
        <div className={styles.headline}>
          <span className={styles.headTitle}>Set up the table</span>
          <span className={styles.muted}>Seat the factions in storm order, then link each phone</span>
        </div>
      </header>
      <main className={styles.setupBody}>
        <div className={styles.setupColumns}>
          <TrackerConfigPanel
            rulesets={rulesets}
            config={config}
            search={search}
            onChange={(next) => {
              const seats = next.seats ?? setup.seats;
              setSetup({ ...setup, ruleset: next.ruleset, seats });
              /* A seat that moved is a different seat: its phone links again. */
              setLinked((was) => was.filter((seat) => seats[seat]?.id === setup.seats[seat]?.id));
              onSeats?.(seats);
            }}
          />
          <div className={styles.setupSide}>
            <ControlBlock
              title="Bid timer"
              description={
                'Each bid gets this long; when it runs out, that faction passes.\nEvery phone counts it down too.'
              }
              input={(field) => (
                <div className={styles.timerField}>
                  <Switch
                    {...field}
                    label={setup.seconds > 0 ? 'On' : 'Off'}
                    checked={setup.seconds > 0}
                    onChange={(event) => setSetup({ ...setup, seconds: event.currentTarget.checked ? 15 : 0 })}
                  />
                  {setup.seconds > 0 ? (
                    <Stepper
                      label="Seconds per bid"
                      value={setup.seconds}
                      min={5}
                      max={75}
                      step={5}
                      onChange={(seconds) => setSetup({ ...setup, seconds })}
                      size="sm"
                      suffix="s"
                    />
                  ) : null}
                </div>
              )}
            />
            <section className={styles.linkPanel} aria-label="Phones">
              <div className={styles.joinCode}>
                <span className={styles.joinBox}>QR</span>
                <small>Scan, pick your faction, hold the phone up</small>
              </div>
              <ul className={styles.linkList}>
                {setup.seats.map((faction, seat) => {
                  const on = linked.includes(seat);
                  return (
                    <li key={faction.id} data-linked={on || undefined}>
                      <FactionTokenFace token={faction} size={28} aria-hidden />
                      <span>{shortName(faction)}</span>
                      {on ? (
                        <Check size={16} aria-label="Phone linked" />
                      ) : (
                        <small className={styles.muted}>no phone yet</small>
                      )}
                    </li>
                  );
                })}
              </ul>
              <LabeledAction
                size="xs"
                icon={mic ? <Mic size={14} /> : <MicOff size={14} />}
                pressed={mic}
                onClick={() => setMic(!mic)}
              >
                Microphone
              </LabeledAction>
            </section>
            <LabeledAction
              emphasis="strong"
              size="lg"
              icon={<Gavel size={18} />}
              disabledReason={setup.seats.length < 2 ? 'Seat at least two factions.' : undefined}
              onClick={() => setGame(newAuction(deck, setup.seats.map(auctionSeat), 1))}
            >
              {linked.length === setup.seats.length
                ? 'Start bidding'
                : `Start bidding (${linked.length} of ${setup.seats.length} phones)`}
            </LabeledAction>
          </div>
        </div>
      </main>
    </div>
  );
}

/** The time left on a bid: it starts over when the bid moves on, and calls `onOut` when it runs out. */
function useBidClock(key: string, seconds: number, onOut: () => void): number {
  const [left, setLeft] = useState(seconds * 1000);
  const out = useRef(onOut);
  useEffect(() => {
    out.current = onOut;
  }, [onOut]);
  useEffect(() => {
    const from = performance.now();
    const timer =
      seconds > 0
        ? setInterval(() => {
            const remaining = Math.max(0, seconds * 1000 - (performance.now() - from));
            setLeft(remaining);
            if (remaining === 0) {
              clearInterval(timer);
              out.current();
            }
          }, 100)
        : undefined;
    return () => {
      clearInterval(timer);
      setLeft(seconds * 1000);
    };
  }, [key, seconds]);
  return left;
}

/* The bid as the tablet calls it: whose it is and what it must beat. */
const callKey = (game: AuctionGame) =>
  `${game.turn}:${game.card}:${toBid(game)}:${highBid(game)?.amount ?? 0}:${game.bidding.passed.length}`;

function LinkedBidding({
  storageKey,
  initial,
  seconds,
  linked,
  loopback,
  mic,
  onMic,
  onLinked,
}: Readonly<{
  storageKey: string;
  initial: AuctionGame;
  seconds: number;
  linked: readonly number[];
  loopback: boolean;
  mic: boolean;
  onMic: (on: boolean) => void;
  onLinked: (seat: number) => void;
}>) {
  const session = useAuctionGame(storageKey, initial);
  const { game } = session;
  const motion = useMotionAllowed();
  const [voice, setVoice] = useState(false);
  useAuctioneerVoice(game, voice);
  const [heard, setHeard] = useState<readonly HeardLine[]>([]);
  const note = (text: string, taken: boolean) =>
    setHeard((lines) => [{ key: (lines[0]?.key ?? 0) + 1, text, taken }, ...lines].slice(0, 4));
  const onCommand = useCallback(
    (command: RemoteCommand) => {
      if (command.kind === 'join') {
        onLinked(command.seat);
      }
      const { text, taken } = runRemote(session, command);
      note(text, taken);
    },
    [onLinked, session]
  );
  const { level } = useToneListener({ on: true, mic, loopback, onCommand });

  const key = callKey(game);
  const turnIndex = game.seats.findIndex((seat) => seat.faction.id === toBid(game));
  const left = useBidClock(
    key,
    turnIndex >= 0 ? seconds : 0,
    useCallback(() => session.act(pass), [session])
  );

  /* The tablet calls each new bid out to the phones: whose it is, the bid to beat, and the time. */
  useEffect(() => {
    if (turnIndex < 0) {
      return;
    }
    const call: Call = { seat: turnIndex, beat: highBid(game)?.amount ?? 0, seconds };
    void playCall(call);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a new bid to call is what plays
  }, [key]);

  const count = game.seats.length;
  const angleOf = (index: number) => (360 / count) * index;
  const turn = seatOf(game, toBid(game));
  const fraction = seconds > 0 ? left / (seconds * 1000) : 1;
  return (
    <div className={styles.tool}>
      <AuctionHeader session={session} voice={voice} onVoice={setVoice}>
        <LabeledAction
          size="xs"
          icon={mic ? <Mic size={14} /> : <MicOff size={14} />}
          pressed={mic}
          onClick={() => onMic(!mic)}
        >
          Microphone
        </LabeledAction>
      </AuctionHeader>
      <main className={styles.linkedBody}>
        <div className={styles.arena}>
          {game.seats.map((seat, index) => (
            <div
              key={seat.faction.id}
              className={styles.arenaSeat}
              data-turn={index === turnIndex || undefined}
              style={{ '--angle': `${angleOf(index)}deg` } as CSSProperties}
            >
              <SeatToken game={game} seat={seat} size={index === turnIndex ? 58 : 44} />
              <span className={styles.arenaName}>
                {shortName(seat.faction)}
                {linked.includes(index) ? <Smartphone size={12} aria-label="Phone linked" /> : null}
              </span>
            </div>
          ))}
          {turnIndex >= 0 ? (
            <div
              className={styles.arrow}
              data-motion={motion || undefined}
              style={{ '--angle': `${angleOf(turnIndex)}deg` } as CSSProperties}
              aria-hidden
            />
          ) : null}
          <div
            className={styles.arenaMiddle}
            data-low={(seconds > 0 && fraction < 0.34) || undefined}
            style={{ '--left': fraction } as CSSProperties}
          >
            <CardUp game={game} size={78} />
          </div>
        </div>
        <div className={styles.arenaCall}>
          {turn ? (
            <>
              <p className={styles.bigCall}>{shortName(turn.faction)} to bid</p>
              <p className={styles.toBeat}>
                {bidToBeat(game)}
                {seconds > 0 ? ` · ${Math.ceil(left / 1000)} s` : ''}
              </p>
            </>
          ) : null}
          {phaseOver(game) ? <PhaseOver session={session} /> : null}
        </div>
        <ResultLine game={game} />
        <div className={styles.listenRow}>
          <span
            className={styles.meter}
            data-state="listening"
            style={{ '--level': Math.min(1, Math.max(0, (level + 100) / 70)) } as CSSProperties}
            aria-hidden
          />
          <ol className={styles.heardLog} aria-label="What it heard">
            {heard.map((line) => (
              <li key={line.key} data-taken={line.taken || undefined}>
                {line.text}
              </li>
            ))}
          </ol>
        </div>
      </main>
    </div>
  );
}

/**
 * A player's phone: pick your faction to link it, then wait.
 * When the tablet calls your bid, it buzzes, says so big, and counts down;
 * your buttons play your answer back to the tablet.
 */
export function LinkedRemote({
  factions,
  loopback = false,
  storySeat,
  joined = false,
}: Readonly<{
  factions: readonly FactionToken[];
  loopback?: boolean;
  /** In a story, each phone is one seat's: it offers that faction first. */
  storySeat?: number;
  /** In a story, a phone that linked before the story starts. */
  joined?: boolean;
}>) {
  const [seat, setSeat] = useState<number | undefined>(joined ? storySeat : undefined);
  const [mic, setMic] = useState(false);
  const [call, setCall] = useState<(Call & { at: number }) | undefined>(undefined);
  const [amount, setAmount] = useState({ beat: 0, value: 1 });
  const [playing, setPlaying] = useState(false);
  const [now, setNow] = useState(() => performance.now());

  useToneListener({
    on: seat !== undefined,
    mic,
    loopback,
    onCall: (heard) => {
      setCall({ ...heard, at: performance.now() });
      if (heard.seat === seat) {
        /* Android buzzes; an iPhone has no web vibration, so the screen flashes instead. */
        navigator.vibrate?.([180, 80, 180]);
      }
    },
  });
  const mine = call !== undefined && call.seat === seat;
  useEffect(() => {
    if (!mine || !call?.seconds) {
      return;
    }
    const timer = setInterval(() => setNow(performance.now()), 200);
    return () => clearInterval(timer);
  }, [mine, call]);

  const send = (command: RemoteCommand) => {
    if (playing) {
      return;
    }
    setPlaying(true);
    void playTune(command).finally(() => setPlaying(false));
  };

  if (seat === undefined) {
    return (
      <div className={styles.phone}>
        <p className={styles.phoneYours}>Which faction are you?</p>
        <ul className={styles.remotePick}>
          {factions.map((faction, index) => (
            <li key={faction.id}>
              <button
                type="button"
                className={styles.remoteFaction}
                data-suggested={index === storySeat || undefined}
                onClick={() => {
                  setSeat(index);
                  send({ seat: index, kind: 'join' });
                }}
              >
                <FactionTokenFace token={faction} size={36} aria-hidden />
                {shortName(faction)}
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  const faction = factions[seat]!;
  const caller = call ? factions[call.seat] : undefined;
  const least = (call?.beat ?? 0) + 1;
  const value = amount.beat === least ? amount.value : least;
  const left = mine && call.seconds ? Math.max(0, Math.ceil(call.seconds - (now - call.at) / 1000)) : undefined;
  return (
    <div className={styles.phone} data-mine={mine || undefined} aria-label={`${faction.name}’s phone`}>
      <div className={styles.phoneHead}>
        <span className={styles.remoteToken} data-playing={playing || undefined}>
          <FactionTokenFace token={faction} size={36} aria-hidden />
        </span>
        <span>
          <strong>{shortName(faction)}</strong>
          <small className={styles.muted}>{playing ? 'Playing…' : 'Linked to the tablet'}</small>
        </span>
      </div>
      {mine ? (
        <>
          <p className={styles.phoneYours}>
            <Vibrate size={20} aria-hidden /> Your bid
            {left !== undefined ? <span className={styles.phoneClock}>{left}</span> : null}
          </p>
          <p className={styles.muted}>{call.beat > 0 ? `Beat ${call.beat}` : 'Open the bidding'}</p>
          <Stepper
            label="Bid"
            value={value}
            min={least}
            max={99}
            onChange={(next) => setAmount({ beat: least, value: next })}
            size="md"
          />
          <div className={styles.remoteButtons}>
            <LabeledAction
              emphasis="strong"
              intent="positive"
              size="md"
              icon={<Gavel size={18} />}
              onClick={() => send({ seat, kind: 'bid', amount: value })}
            >
              {`Bid ${value}`}
            </LabeledAction>
            <LabeledAction size="md" icon={<Hand size={18} />} onClick={() => send({ seat, kind: 'pass' })}>
              Pass
            </LabeledAction>
          </div>
        </>
      ) : (
        <p className={styles.phoneWait}>
          {caller
            ? `${shortName(caller)} is bidding${call!.beat ? ` · beat ${call!.beat}` : ''}.`
            : 'Waiting for bidding to start.'}
        </p>
      )}
      <div className={styles.remoteFoot}>
        <LabeledAction
          size="xs"
          icon={mic ? <Mic size={14} /> : <MicOff size={14} />}
          pressed={mic}
          onClick={() => setMic(!mic)}
        >
          Listen for my turn
        </LabeledAction>
        {mine ? null : (
          <LabeledAction size="xs" icon={<Plus size={14} />} onClick={() => send({ seat, kind: 'join' })}>
            Link again
          </LabeledAction>
        )}
      </div>
    </div>
  );
}
