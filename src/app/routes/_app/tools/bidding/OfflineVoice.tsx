import { LabeledAction } from '@ui/control/LabeledAction';
import { Download, Mic, MicOff, WifiOff } from 'lucide-react';
import { useCallback, useState } from 'react';

import { bid, leastBid, pass, phaseOver, seatOf, shortName, toBid } from './auction';
import type { AuctionGame } from './auction';
import { AuctionHeader, bidToBeat, PhaseOver, ResultLine, useAuctioneerVoice } from './AuctionParts';
import styles from './Bidding.module.css';
import { Arena } from './LinkedTable';
import { readSpoken, useEngine, useOfflineHearing } from './offlineHearing';
import type { Engine, EngineState } from './offlineHearing';
import { useAuctionGame } from './useAuctionGame';

/*
 * Prototype I, offline voice (Norbert, 2026-11-09): no remotes at all. One phone or tablet in the middle hears three
 * things: "bid" and a number, which bids that much for the faction whose bid it is and hands the bid on; "pass"; and
 * "reset", which takes back the last bid or pass. It recognises speech on the device, so it works without a network.
 */

/* Phrases to try where nobody is speaking: each runs exactly as if it was heard. */
const TRY = ['bid 3', 'bid plus one', 'pass', 'bid four', 'reset', 'four'];

type Line = Readonly<{ key: number; phrase: string; answer: string }>;

export function OfflineVoice({
  storageKey,
  initial,
  allowOnline = false,
}: Readonly<{ storageKey: string; initial: AuctionGame; allowOnline?: boolean }>) {
  const session = useAuctionGame(storageKey, initial);
  const { game } = session;
  const [voice, setVoice] = useState(true);
  const speech = useAuctioneerVoice(game, voice);
  const [listen, setListen] = useState(false);
  const { engine, state, install } = useEngine(allowOnline);
  const [heard, setHeard] = useState<readonly Line[]>([]);

  const onPhrase = useCallback(
    (phrase: string) => {
      const spoken = readSpoken(phrase);
      const who = seatOf(game, toBid(game));
      let answer: string;
      if (spoken.kind === 'reset') {
        session.undo();
        answer = 'Taken back.';
      } else if (spoken.kind === 'pass' && who) {
        answer = session.act(pass) ?? `${shortName(who.faction)} passes.`;
      } else if (spoken.kind === 'raise' && who) {
        const amount = leastBid(game);
        answer =
          session.act((current) => bid(current, leastBid(current))) ?? `${shortName(who.faction)} bids ${amount}.`;
      } else if (spoken.kind === 'bid' && who) {
        answer =
          session.act((current) => bid(current, spoken.amount)) ?? `${shortName(who.faction)} bids ${spoken.amount}.`;
      } else {
        answer = 'Not for the auction: say “bid” and a number, “bid plus one”, “pass” or “reset”.';
      }
      setHeard((lines) => [{ key: (lines[0]?.key ?? 0) + 1, phrase, answer }, ...lines].slice(0, 4));
    },
    [game, session]
  );
  /* It never hears itself: listening pauses while it speaks. */
  const { refused } = useOfflineHearing(listen && state === 'ready' && !speech.speaking, engine, onPhrase);
  const turn = seatOf(game, toBid(game));
  return (
    <div className={styles.tool}>
      <AuctionHeader session={session} voice={voice} onVoice={setVoice} />
      <main className={styles.offlineBody}>
        <div className={styles.offlineStage}>
          <Arena game={game} />
          <div className={styles.arenaCall}>
            {turn ? (
              <>
                <p className={styles.hugeCall}>{shortName(turn.faction)}?</p>
                <p className={styles.bigBeat}>{bidToBeat(game)}</p>
              </>
            ) : null}
            {phaseOver(game) ? <PhaseOver session={session} /> : null}
          </div>
        </div>
        <div className={styles.offlineSide}>
          <EngineLine engine={engine} state={state} refused={refused} onInstall={install} />
          <LabeledAction
            emphasis={listen ? 'standard' : 'strong'}
            size="lg"
            icon={listen ? <MicOff size={18} /> : <Mic size={18} />}
            pressed={listen}
            disabledReason={state === 'ready' ? undefined : 'Speech recognition is not ready on this device yet.'}
            onClick={() => setListen(!listen)}
          >
            {listen ? 'Stop listening' : 'Listen to the table'}
          </LabeledAction>
          <p className={styles.muted}>
            Say “bid” and a number, “bid plus one” to beat the bid by one, “pass”, or “reset” to take the last one back.
          </p>
          <ResultLine game={game} />
          <section className={styles.heard} aria-label="What it heard">
            <ol>
              {heard.map((line, index) => (
                <li key={line.key} data-latest={index === 0 || undefined}>
                  <q>{line.phrase}</q> {line.answer}
                </li>
              ))}
            </ol>
            <div className={styles.tryRow} role="group" aria-label="Say it without a microphone">
              {TRY.map((phrase) => (
                <button key={phrase} type="button" className={styles.tryPhrase} onClick={() => onPhrase(phrase)}>
                  “{phrase}”
                </button>
              ))}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

/** Where the hearing happens, in a line: on this device, through the browser's online service, or nowhere yet. */
function EngineLine({
  engine,
  state,
  refused,
  onInstall,
}: Readonly<{ engine: Engine; state: EngineState; refused: boolean; onInstall: () => void }>) {
  if (refused) {
    return (
      <p className={styles.engine} data-state="off">
        The microphone was refused.
      </p>
    );
  }
  if (state === 'checking') {
    return <p className={styles.engine}>Checking this device’s speech recognition…</p>;
  }
  if (engine === 'on-device' && state === 'downloadable') {
    return (
      <div className={styles.engine} data-state="off">
        <span>English speech recognition can run on this device, offline, after a one-time download.</span>
        <LabeledAction size="xs" icon={<Download size={14} />} onClick={onInstall}>
          Download
        </LabeledAction>
      </div>
    );
  }
  if (state === 'downloading') {
    return <p className={styles.engine}>Downloading speech recognition to this device…</p>;
  }
  if (engine === 'on-device') {
    return (
      <p className={styles.engine} data-state="on">
        <WifiOff size={14} aria-hidden /> Hears on this device: works offline.
      </p>
    );
  }
  if (engine === 'online') {
    return <p className={styles.engine}>This browser hears through its maker’s online service, not offline.</p>;
  }
  return (
    <p className={styles.engine} data-state="off">
      This browser cannot recognise speech on the device. Chrome on a laptop or an Android phone can.
    </p>
  );
}
