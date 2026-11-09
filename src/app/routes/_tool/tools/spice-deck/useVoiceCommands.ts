import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

/*
 * Hands-free play: the phone listens for a few words and runs the matching step, so nobody at the table has to touch it.
 * The browser's own speech recognition does the hearing (Chrome, Edge, Safari); where there is none, the voice mode only speaks.
 */

export type VoiceCommand = 'blow' | 'next' | 'undo' | 'repeat';

/* What a player might say for each step; the first match in what was heard wins. */
const WORDS: readonly (readonly [VoiceCommand, RegExp])[] = [
  ['undo', /\b(undo|take (it )?back|oops)\b/i],
  ['repeat', /\b(repeat|again|what was (it|that))\b/i],
  ['next', /\b(next turn|new turn)\b/i],
  ['blow', /\b(spice|blow|draw|next|go)\b/i],
];

export function commandIn(heard: string): VoiceCommand | undefined {
  return WORDS.find(([, words]) => words.test(heard))?.[0];
}

type Recognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
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

/** Whether this browser can listen at all; false on the server. */
export function useCanListen(): boolean {
  return useSyncExternalStore(
    noChanges,
    () => recognitionClass() !== undefined,
    () => false
  );
}

/**
 * Listens while `on` and the browser can, calling `onCommand` for each step it hears.
 * Recognition stops by itself after a pause, so it is started again until switched off.
 */
export function useVoiceCommands(on: boolean, onCommand: (command: VoiceCommand) => void): { listening: boolean } {
  const [refused, setRefused] = useState(false);
  const handler = useRef(onCommand);
  useEffect(() => {
    handler.current = onCommand;
  }, [onCommand]);
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
      if (!active) {
        return;
      }
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const command = commandIn(event.results[i]?.[0]?.transcript ?? '');
        if (command) {
          handler.current(command);
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
    recognition.onstart = () => setRefused(false);
    recognition.start();
    /* Aborted, not stopped: a stop still hands over what was already heard, which may be the start of the tool's own words. */
    return () => {
      active = false;
      recognition.onresult = null;
      recognition.onend = null;
      recognition.onstart = null;
      recognition.abort();
    };
  }, [on]);
  return { listening: on && !refused && recognitionClass() !== undefined };
}
