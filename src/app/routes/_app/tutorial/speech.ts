import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

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

/* The tutorial is written in English, so it is read in an English voice whatever the machine's own language. */
function englishVoice(voices: readonly SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined {
  const english = voices.filter((voice) => voice.lang.toLowerCase().startsWith('en'));
  return english.find((voice) => voice.default) ?? english.find((voice) => voice.localService) ?? english[0];
}

/**
 * Speaks one text at a time and says whether it is speaking.
 * Whatever is speaking stops as the caller goes away, or as the page is left.
 */
export function useSpeech() {
  const [speaking, setSpeaking] = useState(false);
  /* The utterance under way. The browser drops its events once nothing holds it, so it is held here until it ends. */
  const current = useRef<SpeechSynthesisUtterance | null>(null);
  /* Known only in the browser; the server renders no voice, so the page it sends matches the first render. */
  const supported = useSyncExternalStore(noChanges, hasVoice, noVoice);

  const stop = () => {
    current.current = null;
    setSpeaking(false);
    synthesis()?.cancel();
  };

  const speak = (text: string) => {
    const voice = synthesis();
    if (!voice) {
      return;
    }
    voice.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en';
    const chosen = englishVoice(voice.getVoices());
    if (chosen) {
      utterance.voice = chosen;
      utterance.lang = chosen.lang;
    }
    /* A cancelled utterance ends too, sometimes after the next has begun; only the one under way may say speaking is over. */
    const ended = () => {
      if (current.current === utterance) {
        current.current = null;
        setSpeaking(false);
      }
    };
    utterance.addEventListener('end', ended);
    utterance.addEventListener('error', ended);
    current.current = utterance;
    setSpeaking(true);
    voice.speak(utterance);
  };

  useEffect(() => {
    const leave = () => {
      current.current = null;
      synthesis()?.cancel();
    };
    window.addEventListener('pagehide', leave);
    return () => {
      window.removeEventListener('pagehide', leave);
      leave();
    };
  }, []);

  return { supported, speaking, speak, stop };
}
