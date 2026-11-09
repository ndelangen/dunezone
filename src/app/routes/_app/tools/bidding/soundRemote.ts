import { useEffect, useRef, useState } from 'react';

import { CALL_HZ, callReader, callTune, commandReader, GAP_MS, START_HZ, SYMBOL_HZ, TONE_MS, tune } from './soundCode';
import type { Call, RemoteCommand, Tone } from './soundCode';

/*
 * The sound remotes' audio: a phone plays a command's tune through its speaker, and the tablet hears it with its
 * microphone. One page can also hear its own remotes directly, without the air in between (`loopback`), so the
 * prototype can be tried on one laptop with the sound off.
 */

let shared: { context: AudioContext; bus: GainNode } | undefined;

/** The page's one audio context, and the bus its remotes play into besides the speaker. */
function audio() {
  if (!shared) {
    const context = new AudioContext();
    shared = { context, bus: context.createGain() };
  }
  return shared;
}

/** Plays a remote's command. */
export function playTune(command: RemoteCommand): Promise<void> {
  return playTones(tune(command));
}

/** Plays the tablet's call to the remotes. */
export function playCall(call: Call): Promise<void> {
  return playTones(callTune(call));
}

/* Plays tones in turn, each with a soft start and end, so the tune is a chirp and not a click. */
async function playTones(tones: readonly number[], { volume = 0.35 } = {}): Promise<void> {
  const { context, bus } = audio();
  if (context.state === 'suspended') {
    await context.resume();
  }
  const out = context.createGain();
  out.gain.value = volume;
  out.connect(context.destination);
  out.connect(bus);
  let at = context.currentTime + 0.05;
  for (const hz of tones) {
    const tone = context.createOscillator();
    const shape = context.createGain();
    tone.frequency.value = hz;
    shape.gain.setValueAtTime(0, at);
    shape.gain.linearRampToValueAtTime(1, at + 0.008);
    shape.gain.setValueAtTime(1, at + TONE_MS / 1000 - 0.008);
    shape.gain.linearRampToValueAtTime(0, at + TONE_MS / 1000);
    tone.connect(shape).connect(out);
    tone.start(at);
    tone.stop(at + TONE_MS / 1000);
    at += (TONE_MS + GAP_MS) / 1000;
  }
  await new Promise((done) => setTimeout(done, (at - context.currentTime) * 1000 + 50));
  out.disconnect();
}

/* How loud a tone must be, and how far above the next loudest, to count as heard (dB). */
const FLOOR_DB = -75;
const MARGIN_DB = 12;

/** The tone in one spectrum, if one of ours stands out clearly. */
function toneIn(spectrum: Float32Array, binHz: number): { tone: Tone; level: number } {
  const levelAt = (hz: number) => {
    const bin = Math.round(hz / binHz);
    return Math.max(spectrum[bin - 1] ?? -Infinity, spectrum[bin]!, spectrum[bin + 1] ?? -Infinity);
  };
  const candidates: [Tone, number][] = [
    ['call', levelAt(CALL_HZ)],
    ['start', levelAt(START_HZ)],
    ...SYMBOL_HZ.map((hz, index): [Tone, number] => [index, levelAt(hz)]),
  ];
  candidates.sort((a, b) => b[1] - a[1]);
  const [best, next] = candidates;
  const heard = best![1] > FLOOR_DB && best![1] - next![1] > MARGIN_DB;
  return { tone: heard ? best![0] : null, level: best![1] };
}

export type ListenState = 'off' | 'asking' | 'listening' | 'refused';

/**
 * Hears remotes while `on`: through the microphone when `mic`, and the page's own remotes when `loopback`.
 * Hands over each whole command, and says when a tune was heard but did not hold together.
 */
export function useToneListener({
  on,
  mic,
  loopback,
  onCommand,
  onMisheard,
  onCall,
}: Readonly<{
  on: boolean;
  mic: boolean;
  loopback: boolean;
  onCommand?: (command: RemoteCommand) => void;
  onMisheard?: () => void;
  /** For a remote: the tablet's calls. */
  onCall?: (call: Call) => void;
}>): { state: ListenState; level: number } {
  /* How the microphone answered: nothing yet while the browser asks. */
  const [micAnswer, setMicAnswer] = useState<'granted' | 'refused' | undefined>(undefined);
  const [level, setLevel] = useState(-120);
  const handlers = useRef({ onCommand, onMisheard, onCall });
  useEffect(() => {
    handlers.current = { onCommand, onMisheard, onCall };
  }, [onCommand, onMisheard, onCall]);

  useEffect(() => {
    if (!on || (!mic && !loopback)) {
      return;
    }
    const { context, bus } = audio();
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0;
    const spectrum = new Float32Array(analyser.frequencyBinCount);
    const binHz = context.sampleRate / analyser.fftSize;
    const readers = [
      commandReader(
        (command) => handlers.current.onCommand?.(command),
        () => handlers.current.onMisheard?.()
      ),
      callReader((call) => handlers.current.onCall?.(call)),
    ];
    let stream: MediaStream | undefined;
    let source: MediaStreamAudioSourceNode | undefined;
    let stopped = false;
    if (loopback) {
      bus.connect(analyser);
    }
    if (mic) {
      void navigator.mediaDevices
        /* The phone's tune is the signal here, so the browser must not clean it away as echo or noise. */
        ?.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
        .then((granted) => {
          if (stopped) {
            granted.getTracks().forEach((track) => track.stop());
            return;
          }
          stream = granted;
          source = context.createMediaStreamSource(granted);
          source.connect(analyser);
          setMicAnswer('granted');
        })
        .catch(() => setMicAnswer('refused'));
    }
    void context.resume();
    let shown = 0;
    const timer = setInterval(() => {
      analyser.getFloatFrequencyData(spectrum);
      const heard = toneIn(spectrum, binHz);
      readers.forEach((reader) => reader.hear(heard.tone));
      /* The meter moves a few times a second; the reading itself runs every 10 ms. */
      if (++shown % 8 === 0) {
        setLevel(heard.level);
      }
    }, 10);
    return () => {
      stopped = true;
      clearInterval(timer);
      if (loopback) {
        bus.disconnect(analyser);
      }
      source?.disconnect();
      stream?.getTracks().forEach((track) => track.stop());
      setMicAnswer(undefined);
    };
  }, [on, mic, loopback]);
  const state: ListenState =
    !on || (!mic && !loopback)
      ? 'off'
      : !mic
        ? 'listening'
        : micAnswer === 'granted'
          ? 'listening'
          : micAnswer === 'refused'
            ? 'refused'
            : 'asking';
  return { state, level };
}
