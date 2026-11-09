import { LabeledAction } from '@ui/control/LabeledAction';
import { Stepper } from '@ui/control/Stepper';
import { Gavel, Hand, Mic, MicOff, Plus, Volume2 } from 'lucide-react';
import { useCallback, useState } from 'react';
import type { CSSProperties } from 'react';

import { FactionTokenFace } from '@app/routes/_app/play/multiplayer/FactionTokenFace';
import type { FactionToken } from '@app/routes/_app/play/multiplayer/FactionTokenFace';

import { bid, leastBid, pass, phaseOver, seatOf, shortName, toBid } from './auction';
import type { AuctionGame } from './auction';
import { AuctionHeader, bidToBeat, CardUp, PhaseOver, ResultLine, SeatToken, useAuctioneerVoice } from './AuctionParts';
import styles from './Bidding.module.css';
import type { RemoteCommand } from './soundCode';
import { playTune, useToneListener } from './soundRemote';
import { useAuctionGame } from './useAuctionGame';
import type { AuctionSession } from './useAuctionGame';

/*
 * Prototype G, sound remotes (Norbert's idea, 2026-11-09): a tablet in the middle of the table listens. Each player
 * scans its code and gets a remote on their phone: their faction and a few buttons. A button plays a short tune
 * through the phone's speaker that says who it is and what they bid; the tablet hears it and runs the auction.
 * No accounts, no network, no pairing: sound is the radio.
 */

/** The prototype as a story shows it: the listening tablet and every player's remote, side by side. */
export function SoundRemotes({ storageKey, initial }: Readonly<{ storageKey: string; initial: AuctionGame }>) {
  const session = useAuctionGame(storageKey, initial);
  const factions = session.game.seats.map((seat) => seat.faction);
  return (
    <div className={styles.devices}>
      <div className={styles.screenFrame} aria-label="The listening tablet">
        <ListeningTablet session={session} loopback />
      </div>
      <ul className={styles.phoneRow} aria-label="Every player’s remote">
        {factions.map((faction, seat) => (
          <li key={faction.id} className={styles.phoneFrame}>
            <SoundRemote factions={factions} initialSeat={seat} />
          </li>
        ))}
      </ul>
    </div>
  );
}

type HeardLine = Readonly<{ key: number; text: string; taken: boolean }>;

/** The tablet in the middle: it listens for the remotes' tunes and runs the auction from what it hears. */
export function ListeningTablet({
  session,
  loopback = false,
}: Readonly<{ session: AuctionSession; loopback?: boolean }>) {
  const { game } = session;
  const [mic, setMic] = useState(false);
  const [voice, setVoice] = useState(false);
  useAuctioneerVoice(game, voice);
  const [heard, setHeard] = useState<readonly HeardLine[]>([]);
  const note = (text: string, taken: boolean) =>
    setHeard((lines) => [{ key: (lines[0]?.key ?? 0) + 1, text, taken }, ...lines].slice(0, 5));

  const onCommand = useCallback(
    (command: RemoteCommand) => {
      const seat = game.seats[command.seat];
      if (!seat) {
        note(`Heard seat ${command.seat + 1}, who is not at this table.`, false);
        return;
      }
      const name = shortName(seat.faction);
      const said =
        command.kind === 'pass'
          ? `${name}: pass`
          : command.kind === 'raise'
            ? `${name}: one more (${leastBid(game)})`
            : `${name}: bid ${command.amount}`;
      if (toBid(game) !== seat.faction.id) {
        const turn = seatOf(game, toBid(game));
        note(`${said}, but it is ${turn ? `${shortName(turn.faction)}’s` : 'nobody’s'} bid.`, false);
        return;
      }
      const refused = session.act((current) =>
        command.kind === 'pass'
          ? pass(current)
          : bid(current, command.kind === 'raise' ? leastBid(current) : command.amount)
      );
      note(refused ? `${said}: ${refused}` : said, !refused);
    },
    [game, session]
  );
  const { state, level } = useToneListener({
    on: true,
    mic,
    loopback,
    onCommand,
    onMisheard: () => note('Heard a remote, but not clearly. Play it again.', false),
  });
  const turn = seatOf(game, toBid(game));
  /* The meter: how loud the loudest of the remotes' tones is, from silence (-100 dB) to loud (-30 dB). */
  const meter = Math.min(1, Math.max(0, (level + 100) / 70));
  return (
    <div className={styles.tool}>
      <AuctionHeader session={session} voice={voice} onVoice={setVoice} />
      <main className={styles.screenBody}>
        <div className={styles.screenStage}>
          <CardUp game={game} size={120} />
          <div className={styles.screenCall}>
            {turn ? (
              <>
                <SeatToken game={game} seat={turn} size={84} showHand={false} />
                <p className={styles.bigCall}>{shortName(turn.faction)} to bid</p>
                <p className={styles.toBeat}>{bidToBeat(game)}</p>
              </>
            ) : null}
            {phaseOver(game) ? <PhaseOver session={session} /> : null}
          </div>
          <div className={styles.joinCode} aria-label="Get a remote">
            <span className={styles.joinBox}>QR</span>
            <small>Scan for your remote</small>
            <small className={styles.muted}>dune.zone/r/7KQ2</small>
          </div>
        </div>
        <div className={styles.listenRow}>
          <span
            className={styles.meter}
            data-state={state}
            style={{ '--level': meter } as CSSProperties}
            role="meter"
            aria-label="What the tablet hears"
            aria-valuemin={0}
            aria-valuemax={1}
            aria-valuenow={Number(meter.toFixed(2))}
          />
          <span className={styles.muted}>
            {state === 'asking'
              ? 'Allow the microphone to hear the remotes.'
              : state === 'refused'
                ? 'The microphone was refused.'
                : mic
                  ? 'Listening through the microphone.'
                  : 'Hearing this page’s remotes directly; turn the microphone on to hear phones.'}
          </span>
          <LabeledAction
            size="xs"
            icon={mic ? <Mic size={14} /> : <MicOff size={14} />}
            pressed={mic}
            onClick={() => setMic(!mic)}
          >
            Microphone
          </LabeledAction>
        </div>
        <ResultLine game={game} />
        <ol className={styles.heardLog} aria-label="What it heard">
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

/**
 * A player's remote, as their phone opens it from the tablet's code: their faction once picked, an amount, and three buttons.
 * It knows nothing of the auction;
 * it only plays what the player presses, and the tablet decides.
 */
export function SoundRemote({
  factions,
  initialSeat,
}: Readonly<{ factions: readonly FactionToken[]; initialSeat?: number }>) {
  const [seat, setSeat] = useState<number | undefined>(initialSeat);
  const [amount, setAmount] = useState(1);
  const [playing, setPlaying] = useState<string | undefined>(undefined);
  const send = (command: RemoteCommand, label: string) => {
    if (playing) {
      return;
    }
    setPlaying(label);
    void playTune(command).finally(() => setPlaying(undefined));
  };
  if (seat === undefined) {
    return (
      <div className={styles.phone}>
        <p className={styles.phoneYours}>Who are you?</p>
        <ul className={styles.remotePick}>
          {factions.map((faction, index) => (
            <li key={faction.id}>
              <button type="button" className={styles.remoteFaction} onClick={() => setSeat(index)}>
                <FactionTokenFace token={faction} size={40} aria-hidden />
                {shortName(faction)}
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  const faction = factions[seat]!;
  return (
    <div className={styles.phone} data-playing={playing ? true : undefined} aria-label={`${faction.name}’s remote`}>
      <div className={styles.phoneHead}>
        <span className={styles.remoteToken} data-playing={playing ? true : undefined}>
          <FactionTokenFace token={faction} size={40} aria-hidden />
        </span>
        <span>
          <strong>{shortName(faction)}</strong>
          <small className={styles.muted}>{playing ? `Playing “${playing}”…` : 'Point the phone at the tablet'}</small>
        </span>
      </div>
      <Stepper label="Bid" value={amount} min={1} max={99} onChange={setAmount} size="md" />
      <div className={styles.remoteButtons}>
        <LabeledAction
          emphasis="strong"
          intent="positive"
          size="md"
          icon={<Gavel size={18} />}
          accessibleName={`Bid ${amount}`}
          onClick={() => send({ seat, kind: 'bid', amount }, `bid ${amount}`)}
        >
          {`Bid ${amount}`}
        </LabeledAction>
        <LabeledAction
          size="md"
          icon={<Plus size={18} />}
          accessibleName="One more than the bid"
          onClick={() => send({ seat, kind: 'raise' }, 'one more')}
        >
          One more
        </LabeledAction>
        <LabeledAction size="md" icon={<Hand size={18} />} onClick={() => send({ seat, kind: 'pass' }, 'pass')}>
          Pass
        </LabeledAction>
      </div>
      <p className={styles.remoteHint}>
        <Volume2 size={14} aria-hidden /> Each button plays a short tune the tablet hears.
      </p>
    </div>
  );
}
