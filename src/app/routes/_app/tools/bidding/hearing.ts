import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { seatOf, shortName, toBid } from './auction';
import type { AuctionGame } from './auction';

/*
 * The voice auctioneer's ears: the browser's own speech recognition (Chrome, Edge, Safari) hears the table, and each
 * phrase is read as a bid, a pass, or a word for the auctioneer itself. Players speak the way they already do at the
 * table: "five", "Guild bids six", "pass", "no".
 */

export type Heard =
  | Readonly<{ kind: 'bid'; amount: number }>
  | Readonly<{ kind: 'pass' }>
  | Readonly<{ kind: 'undo' }>
  | Readonly<{ kind: 'repeat' }>
  | Readonly<{ kind: 'wrong-faction'; said: string }>
  | Readonly<{ kind: 'unclear' }>;

const NUMBER_WORDS = [
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
/* Words a recogniser hears for a number said at a noisy table. */
const SOUND_ALIKES: Readonly<Record<string, number>> = { won: 1, to: 2, too: 2, for: 4, fore: 4, ate: 8 };

function amountIn(words: readonly string[]): number | undefined {
  for (const word of words) {
    if (/^\d+$/.test(word)) {
      return Number(word);
    }
    const index = NUMBER_WORDS.indexOf(word);
    if (index > 0) {
      return index;
    }
  }
  /* A sound-alike only counts beside "bid" or "spice", so "go to Guild" is not a bid of 2. */
  if (words.some((word) => word === 'bid' || word === 'bids' || word === 'spice')) {
    const alike = words.find((word) => word in SOUND_ALIKES);
    return alike ? SOUND_ALIKES[alike] : undefined;
  }
  return undefined;
}

/** What a phrase heard at the table asks for, given whose bid it is. */
export function readPhrase(game: AuctionGame, phrase: string): Heard {
  const words = phrase
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (words.some((word) => ['undo', 'oops'].includes(word)) || /take (it )?back/.test(phrase.toLowerCase())) {
    return { kind: 'undo' };
  }
  if (words.some((word) => ['repeat', 'again'].includes(word))) {
    return { kind: 'repeat' };
  }
  /* A phrase that names another faction than the one to bid is not taken, so a remark across the table bids nobody. */
  const turn = toBid(game);
  const named = game.seats.find((seat) =>
    shortName(seat.faction)
      .toLowerCase()
      .split(/\s+/)
      .some((part) => part.length > 3 && words.includes(part))
  );
  if (named && turn && named.faction.id !== turn) {
    return { kind: 'wrong-faction', said: shortName(named.faction) };
  }
  if (words.some((word) => ['pass', 'passes', 'no', 'nope', 'out'].includes(word))) {
    return { kind: 'pass' };
  }
  const amount = amountIn(words);
  return amount === undefined ? { kind: 'unclear' } : { kind: 'bid', amount };
}

/** How the auctioneer answers a phrase it could not act on. */
export function refusalFor(game: AuctionGame, heard: Heard): string | undefined {
  if (heard.kind === 'wrong-faction') {
    const turn = seatOf(game, toBid(game));
    return turn ? `It is ${shortName(turn.faction)}’s bid, not ${heard.said}’s.` : undefined;
  }
  return heard.kind === 'unclear' ? 'Say a number, or pass.' : undefined;
}

type Recognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((event: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
};

type RecognitionClass = new () => Recognition;

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

const noChanges = () => () => {};

export function useCanHear(): boolean {
  return useSyncExternalStore(
    noChanges,
    () => recognitionClass() !== undefined,
    () => false
  );
}

/** Hears the table while `on`, handing each phrase to `onPhrase`; recognition is restarted after each pause. */
export function useHearing(on: boolean, onPhrase: (phrase: string) => void): { hearing: boolean } {
  const [refused, setRefused] = useState(false);
  const handler = useRef(onPhrase);
  useEffect(() => {
    handler.current = onPhrase;
  }, [onPhrase]);
  useEffect(() => {
    const Klass = recognitionClass();
    if (!on || !Klass) {
      return;
    }
    let active = true;
    const recognition = new Klass();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'en';
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
  }, [on]);
  return { hearing: on && !refused && recognitionClass() !== undefined };
}
