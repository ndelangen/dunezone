import { IconAction } from '@ui/control/IconAction';
import { Mic, MicOff } from 'lucide-react';
import { useCallback, useState } from 'react';

import { bid, pass, phaseOver, seatOf, shortName, toBid } from './auction';
import type { AuctionGame } from './auction';
import {
  AuctionHeader,
  bidToBeat,
  callSentence,
  CardUp,
  lastResultSentence,
  PhaseOver,
  ResultLine,
  SeatToken,
  useAuctioneerVoice,
} from './AuctionParts';
import styles from './Bidding.module.css';
import { readPhrase, refusalFor, useCanHear, useHearing } from './hearing';
import { useAuctionGame } from './useAuctionGame';

/*
 * Prototype C, the voice auctioneer: a phone or tablet in the middle of the table runs the auction by ear. It calls
 * whose bid it is ("Guild? Fremen has 2."), hears the answer ("four", "pass"), and says what a won card costs and to
 * whom. Nobody touches it; the screen only shows what it heard and whose bid it is, big enough to read across the table.
 */

/* Phrases to try on a laptop or in a story, where nobody is speaking: each runs exactly as if it was heard. */
const TRY = ['pass', 'four', 'Fremen bids six', 'undo', 'repeat'];

type HeardLine = Readonly<{ phrase: string; answer: string }>;

export function VoiceAuctioneer({ storageKey, initial }: Readonly<{ storageKey: string; initial: AuctionGame }>) {
  const session = useAuctionGame(storageKey, initial);
  const { game } = session;
  const [voice, setVoice] = useState(true);
  const [listen, setListen] = useState(false);
  const canHear = useCanHear();
  const speech = useAuctioneerVoice(game, voice);
  const [heard, setHeard] = useState<readonly HeardLine[]>([]);

  const onPhrase = useCallback(
    (phrase: string) => {
      const what = readPhrase(game, phrase);
      const who = seatOf(game, toBid(game));
      let answer = refusalFor(game, what);
      if (what.kind === 'undo') {
        session.undo();
        answer = 'Taken back.';
      } else if (what.kind === 'repeat') {
        const line = [lastResultSentence(game), callSentence(game)].filter(Boolean).join(' ');
        if (voice) {
          speech.speak(line);
        }
        answer = 'Said again.';
      } else if (what.kind === 'pass' && who) {
        answer = session.act(pass) ?? `${shortName(who.faction)} passes.`;
      } else if (what.kind === 'bid' && who) {
        answer =
          session.act((current) => bid(current, what.amount)) ?? `${shortName(who.faction)} bids ${what.amount}.`;
      }
      if (answer && voice && (what.kind === 'unclear' || what.kind === 'wrong-faction' || session.refusal)) {
        speech.speak(answer);
      }
      setHeard((lines) => [{ phrase, answer: answer ?? '' }, ...lines].slice(0, 4));
    },
    [game, session, speech, voice]
  );
  /* It never hears itself: listening pauses while it speaks. */
  const { hearing } = useHearing(listen && canHear && !speech.speaking, onPhrase);
  const turn = seatOf(game, toBid(game));

  return (
    <div className={styles.tool}>
      <AuctionHeader session={session} voice={voice} onVoice={setVoice}>
        {canHear ? (
          <IconAction
            label={listen ? 'Stop listening' : 'Listen to the table'}
            emphasis="quiet"
            intent="neutral"
            pressed={listen}
            icon={listen ? <Mic size={20} /> : <MicOff size={20} />}
            onClick={() => setListen(!listen)}
          />
        ) : null}
      </AuctionHeader>
      <main className={styles.voiceBody}>
        <div className={styles.voiceCall}>
          {turn ? (
            <>
              <span
                className={styles.ear}
                data-hearing={hearing || undefined}
                data-speaking={speech.speaking || undefined}
              >
                <SeatToken game={game} seat={turn} size={140} showHand={false} />
              </span>
              <p className={styles.hugeCall}>{shortName(turn.faction)}?</p>
              <p className={styles.bigBeat}>{bidToBeat(game)}</p>
            </>
          ) : null}
          {phaseOver(game) ? <PhaseOver session={session} /> : null}
        </div>
        <div className={styles.voiceSide}>
          <CardUp game={game} size={72} />
          <p className={styles.muted}>
            {hearing
              ? 'Listening: say a number, “pass”, “repeat” or “undo”.'
              : canHear
                ? 'Tap the microphone and the table bids out loud.'
                : 'This browser cannot listen; try the phrases below.'}
          </p>
        </div>
        <ResultLine game={game} />
        <section className={styles.heard} aria-label="What it heard">
          <ol>
            {heard.map((line, index) => (
              <li key={`${heard.length}-${index}`} data-latest={index === 0 || undefined}>
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
      </main>
    </div>
  );
}
