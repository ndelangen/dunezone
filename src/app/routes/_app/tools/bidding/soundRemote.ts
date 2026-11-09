import { useEffect, useRef, useState } from 'react';

import { ChirpReceiver, modulate } from './chirpModem';
import type { Heard, MessageKind } from './chirpModem';
import { decode, decodeCall, encode, encodeCall } from './soundCode';
import type { Call, RemoteCommand } from './soundCode';

/*
 * The sound remotes' audio: a phone plays a command through its speaker, and the tablet hears it with its microphone;
 * the tablet's call travels the other way. Every message is sent three times in a row (Norbert, 2026-11-09), so one
 * lost to a laugh or a dropped die still arrives; the receiver takes the first copy and ignores its echoes.
 * One page can also hear its own sounds directly, without the air in between (`loopback`), so the prototype can be
 * tried on one laptop.
 */

let shared: { context: AudioContext; bus: GainNode } | undefined;

/** The page's one audio context, and the bus everything it plays also goes into. */
function audio() {
  if (!shared) {
    const context = new AudioContext();
    shared = { context, bus: context.createGain() };
  }
  return shared;
}

export const REPEATS = 3;
const REPEAT_GAP_S = 0.12;

/* Plays a message `repeats` times, a short gap between copies. */
async function playMessage(
  kind: MessageKind,
  symbols: readonly number[],
  { volume = 0.5, repeats = REPEATS } = {}
): Promise<void> {
  const { context, bus } = audio();
  if (context.state === 'suspended') {
    await context.resume();
  }
  const samples = modulate(kind, symbols, context.sampleRate);
  const copy = context.createBuffer(1, samples.length, context.sampleRate);
  copy.copyToChannel(samples, 0);
  const out = context.createGain();
  out.gain.value = volume;
  out.connect(context.destination);
  out.connect(bus);
  let at = context.currentTime + 0.05;
  for (let repeat = 0; repeat < repeats; repeat++) {
    const source = context.createBufferSource();
    source.buffer = copy;
    source.connect(out);
    source.start(at);
    at += copy.duration + REPEAT_GAP_S;
  }
  await new Promise((done) => setTimeout(done, (at - context.currentTime) * 1000));
  out.disconnect();
}

/** Plays a remote's command. */
export function playTune(command: RemoteCommand): Promise<void> {
  return playMessage('command', encode(command));
}

/** Plays the tablet's call to the remotes; a check-in that only repeats the last call plays once. */
export function playCall(call: Call, { checkIn = false } = {}): Promise<void> {
  return playMessage('call', encodeCall(call), { repeats: checkIn ? 1 : REPEATS });
}

/** How often the tablet repeats itself, so a phone can tell it still hears the tablet. */
export const CHECK_IN_MS = 10_000;
/** How long a phone goes without hearing the tablet before it says so. */
export const LOST_MS = 25_000;

/* How long a message's copies keep arriving: a later copy within this time is the same message, not a new one. */
const SAME_MESSAGE_MS = 2600;

export type ListenState = 'off' | 'asking' | 'listening' | 'refused';

/**
 * Hears messages while `on`: through the microphone when `mic`, and the page's own sounds when `loopback`.
 * Hands over each command and call once, however many of its copies arrive, and says when one did not hold together.
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
  const [level, setLevel] = useState(0);
  const handlers = useRef({ onCommand, onMisheard, onCall });
  useEffect(() => {
    handlers.current = { onCommand, onMisheard, onCall };
  }, [onCommand, onMisheard, onCall]);

  useEffect(() => {
    if (!on || (!mic && !loopback)) {
      return;
    }
    const { context, bus } = audio();
    const mix = context.createGain();
    /* The browser hands raw samples over in blocks; nothing of it reaches the speaker. */
    const tap = context.createScriptProcessor(2048, 1, 1);
    const mute = context.createGain();
    mute.gain.value = 0;
    mix.connect(tap);
    tap.connect(mute).connect(context.destination);
    /* When each message was last heard, so its other copies are let go, whatever was heard between them. */
    const seen = new Map<string, number>();
    const receiver = new ChirpReceiver(context.sampleRate, (heard: Heard) => {
      const key = `${heard.kind}:${heard.symbols.join(',')}`;
      const now = performance.now();
      const before = seen.get(key);
      seen.set(key, now);
      if (before !== undefined && now - before < SAME_MESSAGE_MS) {
        return;
      }
      if (heard.kind === 'command') {
        const command = decode(heard.symbols);
        if (command) {
          handlers.current.onCommand?.(command);
        } else {
          handlers.current.onMisheard?.();
        }
      } else {
        const call = decodeCall(heard.symbols);
        if (call) {
          handlers.current.onCall?.(call);
        }
      }
    });
    let blocks = 0;
    tap.onaudioprocess = (event) => {
      receiver.push(new Float32Array(event.inputBuffer.getChannelData(0)));
      /* The meter moves a few times a second. */
      if (++blocks % 6 === 0) {
        setLevel(Math.min(1, Math.log10(1 + receiver.clarity) / 2));
      }
    };
    let stream: MediaStream | undefined;
    let source: MediaStreamAudioSourceNode | undefined;
    let stopped = false;
    if (loopback) {
      bus.connect(mix);
    }
    if (mic) {
      void navigator.mediaDevices
        /* The tune is the signal here, so the browser must not clean it away as echo or noise. */
        ?.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
        .then((granted) => {
          if (stopped) {
            granted.getTracks().forEach((track) => track.stop());
            return;
          }
          stream = granted;
          source = context.createMediaStreamSource(granted);
          source.connect(mix);
          setMicAnswer('granted');
        })
        .catch(() => setMicAnswer('refused'));
    }
    void context.resume();
    return () => {
      stopped = true;
      tap.onaudioprocess = null;
      if (loopback) {
        bus.disconnect(mix);
      }
      source?.disconnect();
      mix.disconnect();
      tap.disconnect();
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
