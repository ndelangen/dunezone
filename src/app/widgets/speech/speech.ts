import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

/*
 * Reading a task aloud, with the browser's own voice: no server, and nothing to download.
 * Only one text speaks at a time, and stopping is at once, mid-word.
 */

/* What a key cap is called when spoken; a letter key is read as its letter. */
const SPOKEN_KEYS: Readonly<Record<string, string>> = {
  '←': 'left arrow',
  '→': 'right arrow',
  '↑': 'up arrow',
  '↓': 'down arrow',
  '[': 'left bracket',
  ']': 'right bracket',
  Esc: 'Escape',
};

/** Prose that names keys as `{Key}`, as it is said aloud: each key by its name, the rest as written. */
export function spokenText(text: string): string {
  return text.replace(/\{([^{}]+)\}/g, (_, key: string) => {
    const name = SPOKEN_KEYS[key] ?? key;
    return key.length === 1 && /\p{L}/u.test(key) ? `the ${name} key` : name;
  });
}

const synthesis = (): SpeechSynthesis | null =>
  typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;

const noChanges = () => () => {};

type Reading = { utterances: readonly SpeechSynthesisUtterance[] };
const hasVoice = () => synthesis() !== null;
const noVoice = () => false;

/*
 * How natural a voice sounds, as far as its name tells.
 * The machine's default is often its oldest voice (on Windows the robotic David or Zira), while the browser offers far better ones beside it.
 */
function naturalness(voice: SpeechSynthesisVoice): number {
  const name = voice.name.toLowerCase();
  /* Edge's child voices sound natural, but not like someone teaching a game. */
  if (/\b(ana|maisie)\b/.test(name)) {
    return 0;
  }
  /* Edge's online voices, such as "Microsoft Aria Online (Natural)". */
  if (/\b(natural|neural)\b/.test(name)) {
    return 3;
  }
  /* Apple's downloaded voices, such as "Ava (Premium)". */
  if (/\((premium|enhanced)\)/.test(name)) {
    return 2;
  }
  /* Chrome's voices, such as "Google US English". */
  if (name.startsWith('google')) {
    return 1;
  }
  return 0;
}

const isEnglish = (lang: string | undefined) => lang?.toLowerCase().startsWith('en') === true;

/* The accent to read in: the learner's own English, else the machine's default English voice's, else American. */
function preferredAccent(english: readonly SpeechSynthesisVoice[], language: string | undefined): string {
  if (isEnglish(language)) {
    return language!.toLowerCase();
  }
  return english.find((voice) => voice.default)?.lang.toLowerCase() ?? 'en-us';
}

/**
 * The tutorial is written in English, so it is read in an English voice whatever the machine's own language.
 * The most natural voice wins;
 * among equals, one in the learner's accent, then the machine's default, then one on the machine itself.
 * Only voices on the machine are offered once an online voice has failed.
 */
export function englishVoice(
  voices: readonly SpeechSynthesisVoice[],
  {
    language = typeof navigator === 'undefined' ? undefined : navigator.language,
    localOnly = false,
  }: { language?: string; localOnly?: boolean } = {}
): SpeechSynthesisVoice | undefined {
  const english = voices.filter((voice) => isEnglish(voice.lang) && (!localOnly || voice.localService));
  const accent = preferredAccent(english, language);
  const accentScore = (lang: string) => {
    const lower = lang.toLowerCase().replace('_', '-');
    if (lower === accent) {
      return 2;
    }
    return lower === 'en-us' || lower === 'en-gb' ? 1 : 0;
  };
  const ranked = english.map((voice) => ({
    voice,
    rank:
      naturalness(voice) * 16 + accentScore(voice.lang) * 4 + (voice.default ? 2 : 0) + (voice.localService ? 1 : 0),
  }));
  return ranked.reduce<(typeof ranked)[number] | undefined>(
    (best, entry) => (best === undefined || entry.rank > best.rank ? entry : best),
    undefined
  )?.voice;
}

/* Chrome's online voices fall silent partway through a long text, so no part is longer than this. */
const LONGEST_PART = 180;

/* Pieces joined back up into parts no longer than they need be. */
function packed(pieces: readonly string[]): string[] {
  const parts: string[] = [];
  for (const piece of pieces) {
    const last = parts.at(-1);
    if (last !== undefined && last.length + piece.length <= LONGEST_PART) {
      parts[parts.length - 1] = last + piece;
    } else {
      parts.push(piece);
    }
  }
  return parts;
}

/* A long sentence in clauses, and a clause still too long in words. */
function clauses(sentence: string): string[] {
  if (sentence.length <= LONGEST_PART) {
    return [sentence];
  }
  return packed(
    (sentence.match(/[^,;:]+[,;:]*/g) ?? [sentence]).flatMap((clause) =>
      clause.length <= LONGEST_PART ? [clause] : (clause.match(/\S+\s*/g) ?? [clause])
    )
  );
}

/* Sentences where the browser has no Intl.Segmenter: each ends at its stop and the space after it. */
const ROUGH_SENTENCE = /\S[\s\S]*?(?:[.!?]+(?=\s|$)|$)/g;

const sentencesOf = (text: string): string[] =>
  typeof Intl.Segmenter === 'function'
    ? Array.from(new Intl.Segmenter('en', { granularity: 'sentence' }).segment(text), ({ segment }) => segment)
    : (text.match(ROUGH_SENTENCE) ?? []);

/** A text in the parts it is read in: each sentence, and a long one in clauses. */
export function speechParts(text: string): string[] {
  const sentences = sentencesOf(text);
  /* A name such as "Supplies!" ends no sentence: what follows it in lower case goes on with the sentence. */
  const joined: string[] = [];
  for (const sentence of sentences.map((part) => part.trim()).filter((part) => part.length > 0)) {
    if (joined.length > 0 && /^\p{Ll}/u.test(sentence)) {
      joined[joined.length - 1] += ` ${sentence}`;
    } else {
      joined.push(sentence);
    }
  }
  return joined
    .flatMap(clauses)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/* What a voice that failed for want of a connection reports; the text is read again in a voice on the machine. */
const OFFLINE_ERRORS = new Set(['network', 'synthesis-failed', 'synthesis-unavailable', 'voice-unavailable']);

/* How long a text waits for a browser that lists its voices late, such as Chrome on its first ask. */
const VOICES_WAIT_MS = 1000;

/**
 * Speaks one text at a time and says whether it is speaking.
 * Whatever is speaking stops as the caller goes away, or as the page is left.
 */
export function useSpeech() {
  const [speaking, setSpeaking] = useState(false);
  /*
   * The text under way, with the utterances reading it.
   * The browser drops their events once nothing holds them, so they are held here until they end.
   */
  const current = useRef<Reading | null>(null);
  const pending = useRef<string | null>(null);
  /* Known only in the browser; the server renders no voice, so the page it sends matches the first render. */
  const supported = useSyncExternalStore(noChanges, hasVoice, noVoice);

  const stop = useCallback(() => {
    pending.current = null;
    current.current = null;
    setSpeaking(false);
    synthesis()?.cancel();
  }, []);

  const speak = useCallback((text: string) => {
    const voice = synthesis();
    if (!voice) {
      return;
    }
    pending.current = null;
    voice.cancel();
    const reading: Reading = { utterances: [] };
    current.current = reading;
    setSpeaking(true);

    const ended = () => {
      if (current.current === reading) {
        current.current = null;
        setSpeaking(false);
      }
    };
    const read = (parts: readonly string[], localOnly: boolean) => {
      const chosen = englishVoice(voice.getVoices(), { localOnly });
      const utterances = parts.map((part) => {
        const utterance = new SpeechSynthesisUtterance(part);
        utterance.lang = chosen?.lang ?? 'en';
        if (chosen) {
          utterance.voice = chosen;
        }
        return utterance;
      });
      reading.utterances = utterances;
      /* A cancelled utterance ends too, sometimes after the next has begun; only the reading under way may say speaking is over. */
      const underWay = () => current.current === reading && reading.utterances === utterances;
      utterances.at(-1)?.addEventListener('end', () => {
        if (underWay()) {
          ended();
        }
      });
      utterances.forEach((utterance, index) => {
        utterance.addEventListener('error', (event) => {
          if (!underWay()) {
            return;
          }
          if (chosen && !chosen.localService && OFFLINE_ERRORS.has(event.error)) {
            /*
             * Chrome starts the next queued part once this handler returns, so the rest is read again in a voice on the machine only after it.
             * Until then this attempt is no longer under way, and its other parts' errors are let be.
             */
            const rest = parts.slice(index);
            reading.utterances = [];
            setTimeout(() => {
              if (current.current === reading && reading.utterances.length === 0) {
                voice.cancel();
                read(rest, true);
              }
            });
            return;
          }
          ended();
          voice.cancel();
          /* A fresh page may require an interaction before speech; only the current step may retry. */
          if (event.error === 'not-allowed') {
            pending.current = text;
          }
        });
      });
      if (utterances.length === 0) {
        ended();
      }
      for (const utterance of utterances) {
        voice.speak(utterance);
      }
    };

    if (voice.getVoices().length > 0) {
      read(speechParts(text), false);
      return;
    }
    /* Read as soon as the voices are listed, or in the browser's own voice if they never are. */
    let started = false;
    const start = () => {
      if (!started && current.current === reading) {
        started = true;
        read(speechParts(text), false);
      }
    };
    voice.addEventListener?.('voiceschanged', start, { once: true });
    setTimeout(start, VOICES_WAIT_MS);
  }, []);

  useEffect(() => {
    /* Chrome lists its voices only some time after it is first asked, so it is asked before the first text. */
    synthesis()?.getVoices();
    const quiet = () => {
      pending.current = null;
      current.current = null;
      synthesis()?.cancel();
    };
    /* The button is back at rest too, for a page the browser keeps and shows again on Back. */
    const leave = () => {
      quiet();
      setSpeaking(false);
    };
    const retry = () => {
      if (pending.current !== null) {
        speak(pending.current);
      }
    };
    window.addEventListener('pagehide', leave);
    window.addEventListener('pointerdown', retry);
    window.addEventListener('keydown', retry);
    return () => {
      window.removeEventListener('pagehide', leave);
      window.removeEventListener('pointerdown', retry);
      window.removeEventListener('keydown', retry);
      quiet();
    };
  }, [speak]);

  return { supported, speaking, speak, stop };
}
