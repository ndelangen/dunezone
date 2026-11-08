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
const hasVoice = () => synthesis() !== null;
const noVoice = () => false;

/*
 * How natural a voice sounds, as far as its name tells. The machine's default is often its oldest voice
 * (on Windows the robotic David or Zira), while the browser offers far better ones beside it.
 */
function naturalness(voice: SpeechSynthesisVoice): number {
  const name = voice.name.toLowerCase();
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

/**
 * The tutorial is written in English, so it is read in an English voice whatever the machine's own language: the most natural one, and among equals the machine's default, then one on the machine itself.
 */
export function englishVoice(voices: readonly SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined {
  const english = voices.filter((voice) => voice.lang.toLowerCase().startsWith('en'));
  const rank = (voice: SpeechSynthesisVoice) =>
    naturalness(voice) * 4 + (voice.default ? 2 : 0) + (voice.localService ? 1 : 0);
  return english.reduce<SpeechSynthesisVoice | undefined>(
    (best, voice) => (best === undefined || rank(voice) > rank(best) ? voice : best),
    undefined
  );
}

/*
 * A text in parts of a sentence or so. Chrome's online voices fall silent partway through a long text,
 * and short parts keep each one well within what they read.
 */
export function speechParts(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/**
 * Speaks one text at a time and says whether it is speaking.
 * Whatever is speaking stops as the caller goes away, or as the page is left.
 */
export function useSpeech() {
  const [speaking, setSpeaking] = useState(false);
  /* The utterances under way. The browser drops their events once nothing holds them, so they are held here until they end. */
  const current = useRef<readonly SpeechSynthesisUtterance[] | null>(null);
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
    current.current = null;
    voice.cancel();
    const chosen = englishVoice(voice.getVoices());
    const utterances = speechParts(text).map((part) => {
      const utterance = new SpeechSynthesisUtterance(part);
      utterance.lang = chosen?.lang ?? 'en';
      if (chosen) {
        utterance.voice = chosen;
      }
      return utterance;
    });
    const last = utterances.at(-1);
    if (!last) {
      setSpeaking(false);
      return;
    }
    /* A cancelled utterance ends too, sometimes after the next has begun; only the text under way may say speaking is over. */
    const ended = () => {
      if (current.current === utterances) {
        current.current = null;
        setSpeaking(false);
      }
    };
    last.addEventListener('end', ended);
    for (const utterance of utterances) {
      utterance.addEventListener('error', (event) => {
        if (current.current !== utterances) {
          return;
        }
        ended();
        voice.cancel();
        /* A fresh page may require an interaction before speech; only the current step may retry. */
        if (event.error === 'not-allowed') {
          pending.current = text;
        }
      });
    }
    current.current = utterances;
    setSpeaking(true);
    for (const utterance of utterances) {
      voice.speak(utterance);
    }
  }, []);

  /* Chrome lists its voices only some time after it is first asked, so it is asked before the first text. */
  useEffect(() => {
    synthesis()?.getVoices();
  }, []);

  useEffect(() => {
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
