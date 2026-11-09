import { Switch } from '@mantine/core';
import { tableCodeSchema } from '@shared/tools/biddingTable';
import { ControlBlock } from '@ui/control/ControlBlock';
import { LabeledAction } from '@ui/control/LabeledAction';
import { Stepper } from '@ui/control/Stepper';
import { Check, Gavel, Hand, LogIn, Repeat, Smartphone, Vibrate, Wifi, WifiOff, Zap } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { renderSVG } from 'uqr';

import { useMotionAllowed } from '@app/styles/motion';
import { FactionTokenFace } from '@app/widgets/faction-token/FactionTokenFace';
import type { FactionToken } from '@app/widgets/faction-token/FactionTokenFace';
import { TrackerConfigPanel } from '@app/widgets/treachery-tracker/TrackerConfig';
import type { FactionSearch, TrackerConfig } from '@app/widgets/treachery-tracker/TrackerConfig';

import { DEFAULT_LIMIT, highBid, newAuction, pass, phaseOver, seatOf, shortName, toBid } from './auction';
import type { AuctionGame, AuctionSeat } from './auction';
import { AuctionHeader, bidToBeat, CardUp, PhaseOver, ResultLine, SeatToken, useAuctioneerVoice } from './AuctionParts';
import styles from './Bidding.module.css';
import { MAX_SECONDS } from './soundCode';
import type { RemoteCommand } from './soundCode';
import { runRemote } from './SoundRemotes';
import type { HeardLine } from './SoundRemotes';
import { deviceId, newTableCode, useTableLink } from './tableLink';
import type { LinkState } from './tableLink';
import { useAuctionGame } from './useAuctionGame';

/*
 * Prototype H, the linked table (Norbert, 2026-11-09). The tablet in the middle seats the factions with Dune Zone's
 * faction picker, starting from the base six, and shows a QR code; each player scans it and picks their faction, which
 * links their phone as that faction's remote. Bidding then goes round in seat order: an arrow on the tablet points at
 * the faction whose bid it is, and that phone buzzes and counts down the bid timer the table set.
 * The devices talk over the network (tableLink.ts: introduced by a table object online, then directly over the Wi-Fi);
 * sound-based linking was tried and dropped (Norbert, 2026-11-09: unpleasant, and unreliable).
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

/** The bid as the tablet calls it: whose it is, what it must beat, and how long is left on it. */
type CallState = Readonly<{ seat: number; beat: number; seconds: number; left?: number }>;

/** What the tablet tells the phones, every time it changes and every two seconds besides, so they know it is there. */
type TabletSays = Readonly<{
  kind: 'state';
  seats: readonly FactionToken[];
  /** Which phone holds which seat. */
  linked: Readonly<Record<string, number>>;
  call?: CallState;
  /** The last command the tablet took from each phone, so a phone knows its tap arrived. */
  acks: Readonly<Record<string, number>>;
}>;
/** What a phone tells the tablet. */
type PhoneSays =
  | Readonly<{ kind: 'join'; seat: number }>
  | Readonly<{ kind: 'command'; id: number; command: RemoteCommand }>;

const STATE_EVERY_MS = 2000;
/** How long a phone goes without hearing the tablet before it says so. */
const LOST_MS = 5000;
const RESEND_MS = 2000;

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

/** Where a phone opens to join `code`: the tool page, or in Storybook the phone's story. */
export type JoinUrl = (code: string) => string;

/** The prototype as a story shows it: the tablet and each player's phone side by side, on one table. */
export function LinkedTable(props: Props & Readonly<{ code: string }>) {
  const [factions, setFactions] = useState<readonly FactionToken[]>(() => props.started?.setup.seats ?? props.baseSix);
  return (
    <div className={styles.devices}>
      <div className={`${styles.screenFrame} ${styles.tallFrame}`} aria-label="The tablet in the middle">
        <LinkedTablet {...props} local onSeats={setFactions} />
      </div>
      <ul className={styles.phoneRow} aria-label="Every player’s phone">
        {factions.map((faction, seat) => (
          <li key={faction.id} className={styles.phoneFrame}>
            <LinkedRemote
              code={props.code}
              local
              device={`story-phone-${seat}`}
              storySeat={seat}
              joined={props.started?.linked.includes(seat)}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** How a device's link stands, in a word or two, with how it travels. */
function LinkLine({ state, linked }: Readonly<{ state: LinkState; linked: boolean }>) {
  const direct = state.direct.length > 0;
  return (
    <small className={styles.linkState} data-state={!state.relay && !direct ? 'lost' : linked ? 'linked' : 'linking'}>
      {!state.relay && !direct ? (
        <>
          <WifiOff size={12} aria-hidden /> Offline, trying again…
        </>
      ) : direct ? (
        <>
          <Zap size={12} aria-hidden /> Direct over the Wi‑Fi
        </>
      ) : (
        <>
          <Wifi size={12} aria-hidden /> Through the internet
        </>
      )}
    </small>
  );
}

/** The table's QR code: a phone that scans it opens the remote, joined to this table. */
function JoinCode({ code, url }: Readonly<{ code: string; url: string }>) {
  return (
    <div className={styles.joinCode}>
      <a
        className={styles.joinQr}
        href={url}
        target="_blank"
        rel="noreferrer"
        aria-label={`Join table ${code}`}
        /* The code is drawn from our own text, never from anyone's input. */
        dangerouslySetInnerHTML={{
          __html: renderSVG(url, { border: 2, blackColor: '#111', whiteColor: '#fff' }),
        }}
      />
      <span className={styles.joinCodeText}>
        <strong>{code}</strong>
        <small>Scan with your phone’s camera, then pick your faction</small>
      </span>
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
  code: fixedCode,
  local = false,
  joinUrl = (code) => `${location.origin}/tools/bidding?table=${code}`,
  onSeats,
}: Props &
  Readonly<{ code?: string; local?: boolean; joinUrl?: JoinUrl; onSeats?: (seats: readonly FactionToken[]) => void }>) {
  const [code] = useState(() => fixedCode ?? newTableCode());
  const [device] = useState(() => (local ? 'story-tablet' : deviceId()));
  const [setup, setSetup] = useState<LinkedSetup>(
    () => started?.setup ?? { seats: baseSix, seconds: 15, ruleset: rulesets[0]?.id ?? '' }
  );
  /* Which phone holds which seat; a story's phones that linked before it starts are already in. */
  const [holders, setHolders] = useState<Readonly<Record<string, number>>>(() =>
    Object.fromEntries((started?.linked ?? []).map((seat) => [`story-phone-${seat}`, seat]))
  );
  const [game, setGame] = useState<AuctionGame | undefined>(() =>
    started ? newAuction(deck, started.setup.seats.map(auctionSeat), 1) : undefined
  );
  const [call, setCall] = useState<(CallState & { from: number }) | undefined>(undefined);
  const acks = useRef<Record<string, number>>({});
  /* The auction takes the phones' commands while it runs. */
  const onCommand = useRef<((command: RemoteCommand) => void) | undefined>(undefined);
  const setTaker = useCallback((take: ((command: RemoteCommand) => void) | undefined) => {
    onCommand.current = take;
  }, []);

  const { state, send } = useTableLink(code, 'tablet', device, local, (from, data) => {
    const said = data as PhoneSays;
    if (said.kind === 'join' && said.seat >= 0 && said.seat < setup.seats.length) {
      setHolders((was) => {
        /* One phone per seat: a newer phone for a seat takes it over. */
        const kept = Object.fromEntries(
          Object.entries(was).filter(([phone, seat]) => seat !== said.seat || phone === from)
        );
        return { ...kept, [from]: said.seat };
      });
    } else if (said.kind === 'command' && said.id > (acks.current[from] ?? 0)) {
      acks.current[from] = said.id;
      if (holders[from] === said.command.seat) {
        onCommand.current?.(said.command);
      }
      sayState();
    }
  });
  /* Seats whose phone is at the table now. */
  const present = Object.fromEntries(Object.entries(holders).filter(([phone]) => state.phones.includes(phone)));
  const linked = [...new Set(Object.values(present))];

  const latest = useRef<() => TabletSays>(() => ({ kind: 'state', seats: [], linked: {}, acks: {} }));
  latest.current = () => ({
    kind: 'state',
    seats: setup.seats,
    linked: present,
    acks: acks.current,
    ...(call
      ? {
          call: {
            seat: call.seat,
            beat: call.beat,
            seconds: call.seconds,
            ...(call.seconds > 0 ? { left: Math.max(0, call.seconds * 1000 - (performance.now() - call.from)) } : {}),
          },
        }
      : {}),
  });
  const sayState = () => send('phones', latest.current());
  const said = JSON.stringify({ seats: setup.seats.map((seat) => seat.id), present, call });
  useEffect(() => {
    send('phones', latest.current());
    const timer = setInterval(() => send('phones', latest.current()), STATE_EVERY_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `said` stands for everything the state carries.
  }, [said, state.phones.length, state.relay]);

  if (game) {
    return (
      <LinkedBidding
        storageKey={storageKey}
        initial={game}
        seconds={setup.seconds}
        linked={linked}
        link={state}
        onCall={setCall}
        onTaker={setTaker}
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
              setHolders((was) =>
                Object.fromEntries(Object.entries(was).filter(([, seat]) => seats[seat]?.id === setup.seats[seat]?.id))
              );
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
                      max={MAX_SECONDS}
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
              <JoinCode code={code} url={joinUrl(code)} />
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
              <LinkLine state={state} linked />
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
  link,
  onCall,
  onTaker,
}: Readonly<{
  storageKey: string;
  initial: AuctionGame;
  seconds: number;
  linked: readonly number[];
  link: LinkState;
  onCall: (call: (CallState & { from: number }) | undefined) => void;
  onTaker: (take: ((command: RemoteCommand) => void) | undefined) => void;
}>) {
  const session = useAuctionGame(storageKey, initial);
  const { game } = session;
  const [voice, setVoice] = useState(false);
  useAuctioneerVoice(game, voice);
  const [heard, setHeard] = useState<readonly HeardLine[]>([]);
  const key = callKey(game);
  const turnIndex = game.seats.findIndex((seat) => seat.faction.id === toBid(game));
  const beat = highBid(game)?.amount ?? 0;
  /* The phones hear the bid as soon as it moves on. */
  useEffect(() => {
    onCall(turnIndex >= 0 ? { seat: turnIndex, beat, seconds, from: performance.now() } : undefined);
  }, [key, turnIndex, beat, seconds, onCall]);
  useEffect(() => () => onCall(undefined), [onCall]);
  const take = useCallback(
    (command: RemoteCommand) => {
      const { text, taken } = runRemote(session, command);
      setHeard((lines) => [{ key: (lines[0]?.key ?? 0) + 1, text, taken }, ...lines].slice(0, 4));
    },
    [session]
  );
  useEffect(() => {
    onTaker(take);
    return () => onTaker(undefined);
  }, [onTaker, take]);

  const left = useBidClock(
    key,
    turnIndex >= 0 ? seconds : 0,
    useCallback(() => session.act(pass), [session])
  );

  const turn = seatOf(game, toBid(game));
  const fraction = seconds > 0 ? left / (seconds * 1000) : 1;
  return (
    <div className={styles.tool}>
      <AuctionHeader session={session} voice={voice} onVoice={setVoice}>
        <LinkLine state={link} linked />
      </AuctionHeader>
      <main className={styles.linkedBody}>
        <Arena game={game} linked={linked} fraction={fraction} low={seconds > 0 && fraction < 0.34} />
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
        <ol className={styles.heardLog} aria-label="What the phones said">
          {heard.map((line) => (
            <li key={line.key} data-taken={line.taken || undefined}>
              {line.text}
            </li>
          ))}
        </ol>
      </main>
    </div>
  );
}

/** The table a phone was sent to: `?table=` on the page it opened. */
function tableFromPage(): string | undefined {
  try {
    const code = new URLSearchParams(location.search).get('table')?.toUpperCase();
    return tableCodeSchema.safeParse(code).success ? code : undefined;
  } catch {
    return undefined;
  }
}

/**
 * A player's phone: join the table (the QR code opens it joined), pick your faction, then wait.
 * When it is your bid, it buzzes, says so big, and counts down;
 * your buttons answer the tablet.
 */
export function LinkedRemote({
  code: fixedCode,
  local = false,
  device: fixedDevice,
  storySeat,
  joined = false,
}: Readonly<{
  code?: string;
  local?: boolean;
  device?: string;
  /** In a story, each phone is one seat's: it offers that faction first. */
  storySeat?: number;
  /** In a story, a phone that linked before the story starts. */
  joined?: boolean;
}>) {
  const [code, setCode] = useState<string | undefined>(() => fixedCode ?? tableFromPage());
  const [typed, setTyped] = useState('');
  const [device] = useState(() => fixedDevice ?? deviceId());
  const [table, setTable] = useState<(TabletSays & { at: number }) | undefined>(undefined);
  const [chosen, setChosen] = useState<number | undefined>(joined ? storySeat : undefined);
  const [amount, setAmount] = useState({ beat: 0, value: 1 });
  const [now, setNow] = useState(() => performance.now());
  /* A tap goes again every RESEND_MS until the tablet's state shows it took it. */
  const pending = useRef<{ id: number; command: RemoteCommand; sentAt: number } | undefined>(undefined);
  const nextId = useRef(Date.now());
  const [sending, setSending] = useState(false);

  const { state, send } = useTableLink(code, 'phone', device, local, (_from, data) => {
    const said = data as TabletSays;
    if (said.kind !== 'state') {
      return;
    }
    const at = performance.now();
    setTable({ ...said, at });
    const waiting = pending.current;
    if (waiting && (said.acks[device] ?? 0) >= waiting.id) {
      pending.current = undefined;
      setSending(false);
    }
    const mine = said.call !== undefined && said.call.seat === said.linked[device];
    const wasMine = table?.call !== undefined && table.call.seat === table.linked[device];
    const moved =
      JSON.stringify(said.call && [said.call.seat, said.call.beat]) !==
      JSON.stringify(table?.call && [table.call.seat, table.call.beat]);
    if (mine && (moved || !wasMine)) {
      /* Android buzzes; an iPhone has no web vibration, so the screen lights up instead. */
      navigator.vibrate?.([180, 80, 180]);
    }
  });
  const seat = table?.linked[device];
  /* Joining: once the tablet is there, and again until it shows this phone in its seat. */
  useEffect(() => {
    if (chosen === undefined || seat === chosen || !state.tablet) {
      return;
    }
    send('tablet', { kind: 'join', seat: chosen } satisfies PhoneSays);
    const timer = setInterval(() => send('tablet', { kind: 'join', seat: chosen } satisfies PhoneSays), RESEND_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `send` is the link's, fresh every render.
  }, [chosen, seat, state.tablet, state.relay, state.direct.length]);
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(performance.now());
      const waiting = pending.current;
      if (waiting && performance.now() - waiting.sentAt > RESEND_MS) {
        waiting.sentAt = performance.now();
        send('tablet', { kind: 'command', id: waiting.id, command: waiting.command } satisfies PhoneSays);
      }
    }, 250);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `send` is the link's, fresh every render.
  }, []);
  const lost = table !== undefined && now - table.at > LOST_MS;
  const tap = (command: RemoteCommand) => {
    const id = ++nextId.current;
    pending.current = { id, command, sentAt: performance.now() };
    setSending(true);
    send('tablet', { kind: 'command', id, command } satisfies PhoneSays);
  };

  if (!code) {
    return (
      <div className={styles.phone}>
        <p className={styles.phoneYours}>Join a table</p>
        <p className={styles.muted}>Scan the QR code on the tablet with your camera, or type its code.</p>
        <form
          className={styles.codeForm}
          onSubmit={(event) => {
            event.preventDefault();
            const next = typed.trim().toUpperCase();
            if (tableCodeSchema.safeParse(next).success) {
              setCode(next);
            }
          }}
        >
          <input
            className={styles.codeInput}
            value={typed}
            onChange={(event) => setTyped(event.currentTarget.value)}
            placeholder="ABC234"
            aria-label="Table code"
            autoCapitalize="characters"
            autoComplete="off"
            maxLength={6}
          />
          <LabeledAction emphasis="strong" size="md" type="submit" icon={<LogIn size={16} />}>
            Join
          </LabeledAction>
        </form>
      </div>
    );
  }
  const factions = table?.seats ?? [];
  if (chosen === undefined || !factions[chosen]) {
    return (
      <div className={styles.phone}>
        <p className={styles.phoneYours}>{table ? 'Which faction are you?' : 'Finding the tablet…'}</p>
        <ul className={styles.remotePick}>
          {factions.map((faction, index) => {
            const taken = Object.entries(table!.linked).some(([phone, held]) => held === index && phone !== device);
            return (
              <li key={faction.id}>
                <button
                  type="button"
                  className={styles.remoteFaction}
                  data-suggested={index === storySeat || undefined}
                  onClick={() => setChosen(index)}
                >
                  <FactionTokenFace token={faction} size={36} aria-hidden />
                  {shortName(faction)}
                  {taken ? <Smartphone size={14} aria-label="Another phone has this seat" /> : null}
                </button>
              </li>
            );
          })}
        </ul>
        <LinkLine state={state} linked={false} />
      </div>
    );
  }
  const faction = factions[chosen]!;
  const call = table?.call;
  const mine = call !== undefined && seat === chosen && call.seat === chosen;
  const caller = call ? factions[call.seat] : undefined;
  const least = (call?.beat ?? 0) + 1;
  const value = amount.beat === least ? amount.value : least;
  const left =
    mine && call.left !== undefined ? Math.max(0, Math.ceil((call.left - (now - table!.at)) / 1000)) : undefined;
  return (
    <div className={styles.phone} data-mine={mine || undefined} aria-label={`${faction.name}’s phone`}>
      <div className={styles.phoneHead}>
        <span className={styles.remoteToken} data-playing={sending || undefined}>
          <FactionTokenFace token={faction} size={36} aria-hidden />
        </span>
        <span>
          <strong>{shortName(faction)}</strong>
          <small className={styles.linkState} data-state={lost ? 'lost' : seat === chosen ? 'linked' : 'linking'}>
            {lost ? (
              <>
                <WifiOff size={12} aria-hidden /> Can’t reach the tablet
              </>
            ) : sending ? (
              'Sending…'
            ) : seat === chosen ? (
              'Linked to the tablet'
            ) : (
              'Linking…'
            )}
          </small>
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
              onClick={() => tap({ seat: chosen, kind: 'bid', amount: value })}
            >
              {`Bid ${value}`}
            </LabeledAction>
            <LabeledAction size="md" icon={<Hand size={18} />} onClick={() => tap({ seat: chosen, kind: 'pass' })}>
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
        <LinkLine state={state} linked={seat === chosen} />
        {mine ? null : (
          <LabeledAction size="xs" icon={<Repeat size={14} />} onClick={() => setChosen(undefined)}>
            Change faction
          </LabeledAction>
        )}
      </div>
    </div>
  );
}

/**
 * The table seen from above: every faction round the edge in seat order, an arrow from the middle to the one whose bid it is, and the card in the middle inside a ring that drains with the bid timer.
 */
export function Arena({
  game,
  linked = [],
  fraction = 1,
  low = false,
}: Readonly<{ game: AuctionGame; linked?: readonly number[]; fraction?: number; low?: boolean }>) {
  const motion = useMotionAllowed();
  const count = game.seats.length;
  const angleOf = (index: number) => (360 / count) * index;
  const turnIndex = game.seats.findIndex((seat) => seat.faction.id === toBid(game));
  return (
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
      <div className={styles.arenaMiddle} data-low={low || undefined} style={{ '--left': fraction } as CSSProperties}>
        <CardUp game={game} size={78} />
      </div>
    </div>
  );
}
