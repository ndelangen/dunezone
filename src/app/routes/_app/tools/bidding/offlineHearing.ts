import { useEffect, useRef, useState } from 'react';

/*
 * Offline voice (Norbert, 2026-11-09): the auction by voice alone, no remotes, no network. It needs only a few words:
 * "bid" and a number, "pass" and "reset". Chrome can now recognise speech on the device itself
 * (`processLocally`, with the language pack it downloads once through `SpeechRecognition.install`), and can be told
 * which words to expect (`phrases`), which makes those few words far more reliable. Where a browser has no on-device
 * recognition, the page says so and can fall back to the browser's own, which may send the sound to its maker.
 */

export type Engine = 'on-device' | 'online' | 'none';
export type EngineState = 'checking' | 'downloadable' | 'downloading' | 'ready' | 'unavailable';

type Recognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  processLocally?: boolean;
  phrases?: unknown[];
  start(): void;
  stop(): void;
  onresult: ((event: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
};

type RecognitionClass = (new () => Recognition) & {
  available?: (options: { langs: string[]; processLocally: boolean }) => Promise<string>;
  install?: (options: { langs: string[]; processLocally: boolean }) => Promise<boolean>;
};

const LANG = 'en-US';

const recognitionClass = (): RecognitionClass | undefined => {
  if (typeof window === 'undefined') {
    return undefined;
  }
  const scope = window as unknown as {
    SpeechRecognition?: RecognitionClass;
    webkitSpeechRecognition?: RecognitionClass;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition;
};

/* The words the auction listens for, so the recogniser favours them over anything that sounds alike. */
const EXPECTED = [
  'bid',
  'plus',
  'pass',
  'reset',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
];

function biased(recognition: Recognition) {
  const Phrase = (window as unknown as { SpeechRecognitionPhrase?: new (phrase: string, boost: number) => unknown })
    .SpeechRecognitionPhrase;
  if (Phrase && 'phrases' in recognition) {
    try {
      recognition.phrases = EXPECTED.map((word) => new Phrase(word, 5));
    } catch {
      /* A browser that lists phrases but refuses these still hears plainly. */
    }
  }
}

/** Which engine this browser offers, and whether the on-device one is ready, downloading or missing. */
export function useEngine(allowOnline: boolean): { engine: Engine; state: EngineState; install: () => void } {
  const [state, setState] = useState<EngineState>('checking');
  const [engine, setEngine] = useState<Engine>('none');
  const Klass = recognitionClass();
  useEffect(() => {
    let live = true;
    const settle = (next: Engine, nextState: EngineState) => {
      if (live) {
        setEngine(next);
        setState(nextState);
      }
    };
    if (!Klass) {
      settle('none', 'unavailable');
    } else if (!Klass.available || navigator.webdriver) {
      /* A browser driven by tests has no speech service, and asking it what is available crashes the page. */
      settle(allowOnline ? 'online' : 'none', allowOnline ? 'ready' : 'unavailable');
    } else {
      void Klass.available({ langs: [LANG], processLocally: true })
        .then((answer) => {
          if (answer === 'available') {
            settle('on-device', 'ready');
          } else if (answer === 'downloadable' || answer === 'downloading') {
            settle('on-device', answer);
          } else {
            settle(allowOnline ? 'online' : 'none', allowOnline ? 'ready' : 'unavailable');
          }
        })
        .catch(() => settle(allowOnline ? 'online' : 'none', allowOnline ? 'ready' : 'unavailable'));
    }
    return () => {
      live = false;
    };
  }, [Klass, allowOnline]);
  const install = () => {
    if (!Klass?.install) {
      return;
    }
    setState('downloading');
    void Klass.install({ langs: [LANG], processLocally: true })
      .then((done) => setState(done ? 'ready' : 'unavailable'))
      .catch(() => setState('unavailable'));
  };
  return { engine, state, install };
}

/** Hears the table while `on` with the given engine, handing each phrase to `onPhrase`; restarted after each pause. */
export function useOfflineHearing(on: boolean, engine: Engine, onPhrase: (phrase: string) => void) {
  const [refused, setRefused] = useState(false);
  const handler = useRef(onPhrase);
  useEffect(() => {
    handler.current = onPhrase;
  }, [onPhrase]);
  useEffect(() => {
    const Klass = recognitionClass();
    if (!on || !Klass || engine === 'none') {
      return;
    }
    let active = true;
    const recognition = new Klass();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = LANG;
    if (engine === 'on-device') {
      recognition.processLocally = true;
    }
    biased(recognition);
    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const phrase = event.results[i]?.[0]?.transcript?.trim();
        if (phrase) {
          handler.current(phrase);
        }
      }
    };
    recognition.onend = () => {
      if (active) {
        recognition.start();
      }
    };
    recognition.onerror = (event) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        active = false;
        setRefused(true);
      }
    };
    recognition.start();
    return () => {
      active = false;
      recognition.stop();
    };
  }, [on, engine]);
  return { refused };
}

/** What a phrase asks: a bid of an amount, a pass, a reset, or nothing the auction knows. */
export type Spoken =
  | Readonly<{ kind: 'bid'; amount: number }>
  | Readonly<{ kind: 'raise' | 'pass' | 'reset' | 'other' }>;

const NUMBERS = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
  'twenty',
];
/* What a recogniser writes for a number heard right after "bid". */
const ALIKE: Readonly<Record<string, number>> = { won: 1, to: 2, too: 2, for: 4, fore: 4, ate: 8 };

/**
 * Reads a phrase: a number counts only straight after "bid" (Norbert, 2026-11-09), so a number said across the table never bids.
 * "bid 4" bids four for the faction whose bid it is, and hands the bid on.
 */
export function readSpoken(phrase: string): Spoken {
  const words = phrase
    .toLowerCase()
    .replace(/\+/g, ' plus ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  for (let index = words.length - 1; index >= 0; index--) {
    const word = words[index]!;
    if (word === 'bid' || word === 'bids' || word === 'bit') {
      /* "bid plus one" bids one more than the bid to beat (Norbert, 2026-11-09). */
      if (words[index + 1] === 'plus' && ['1', 'one', 'won'].includes(words[index + 2] ?? '')) {
        return { kind: 'raise' };
      }
      const next = words[index + 1];
      const amount =
        next === undefined
          ? undefined
          : /^\d+$/.test(next)
            ? Number(next)
            : NUMBERS.indexOf(next) > 0
              ? NUMBERS.indexOf(next)
              : ALIKE[next];
      if (amount !== undefined && amount > 0) {
        return { kind: 'bid', amount };
      }
    }
    /* A recogniser sometimes writes "bid 4" as "bid4" or "b4". */
    const joined = /^(?:bid|bit)(\d+)$/.exec(word);
    if (joined) {
      return { kind: 'bid', amount: Number(joined[1]) };
    }
  }
  if (words.includes('pass') || words.includes('passed')) {
    return { kind: 'pass' };
  }
  if (words.includes('reset')) {
    return { kind: 'reset' };
  }
  return { kind: 'other' };
}
