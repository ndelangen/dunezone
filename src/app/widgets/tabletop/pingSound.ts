import type { PingSound } from '@shared/play/protocol';

import { tableAudio } from './tableSounds';

/*
 * The ping's sounds, made in the browser so they need no file, at this viewer's table volume.
 * A page that has had no click or key yet may not play sound, as browsers allow; its pings still show, silently.
 * The tone is gentler than it was (Norbert, 2026-11-17, #2982): softer, with a slower attack and less of its bright overtone.
 */
const TONES = [
  { frequency: 1480, peak: 0.1 },
  { frequency: 2960, peak: 0.015 },
] as const;
const ATTACK_S = 0.025;
const DECAY_S = 0.55;

/* The rumble: a buzzing sawtooth falling through these pitches, fluttering, muffled as if from under the sand, fading out over its back part. */
const RUMBLE_S = 2.8;
const RUMBLE_PITCH = [
  [0, 62],
  [0.4, 50],
  [1, 36],
] as const;
const RUMBLE_FLUTTER_HZ = 16;
const RUMBLE_FLUTTER_DEPTH = 0.45;
const RUMBLE_CUTOFF_HZ = 420;
const RUMBLE_PEAK = 0.8;
const RUMBLE_FADE_FROM = 0.35;

/** Plays a ping's sound: the usual bright tone, or the sound the ping asked for. */
export function playPingSound(sound?: PingSound) {
  const audio = tableAudio();
  if (!audio) {
    return;
  }
  if (sound === 'fart') {
    playRumble(audio.context, audio.output);
  } else {
    playTone(audio.context, audio.output);
  }
}

function playTone(context: AudioContext, output: AudioNode) {
  const now = context.currentTime;
  for (const { frequency, peak } of TONES) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.92, now + DECAY_S);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(peak, now + ATTACK_S);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + DECAY_S);
    oscillator.connect(gain).connect(output);
    oscillator.start(now);
    oscillator.stop(now + DECAY_S + 0.05);
  }
}

function playRumble(context: AudioContext, output: AudioNode) {
  const start = context.currentTime + 0.02;
  const end = start + RUMBLE_S;

  const filter = context.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = RUMBLE_CUTOFF_HZ;
  filter.Q.value = 4;
  filter.connect(output);

  const envelope = context.createGain();
  envelope.gain.setValueAtTime(0.0001, start);
  envelope.gain.exponentialRampToValueAtTime(RUMBLE_PEAK, start + 0.03);
  envelope.gain.setValueAtTime(RUMBLE_PEAK, start + RUMBLE_S * RUMBLE_FADE_FROM);
  envelope.gain.exponentialRampToValueAtTime(0.0001, end);
  envelope.connect(filter);

  const buzz = context.createOscillator();
  buzz.type = 'sawtooth';
  for (const [at, frequency] of RUMBLE_PITCH) {
    if (at === 0) {
      buzz.frequency.setValueAtTime(frequency, start);
    } else {
      buzz.frequency.exponentialRampToValueAtTime(frequency, start + at * RUMBLE_S);
    }
  }
  /* A square wave on the loudness makes the flutter; a slower wobble on the pitch keeps it from sounding like an engine. */
  const flutter = context.createOscillator();
  flutter.type = 'square';
  flutter.frequency.value = RUMBLE_FLUTTER_HZ;
  const flutterDepth = context.createGain();
  flutterDepth.gain.value = RUMBLE_FLUTTER_DEPTH;
  const fluttered = context.createGain();
  fluttered.gain.value = 1 - RUMBLE_FLUTTER_DEPTH;
  flutter.connect(flutterDepth).connect(fluttered.gain);
  const wobble = context.createOscillator();
  wobble.frequency.value = RUMBLE_FLUTTER_HZ * 0.37;
  const wobbleDepth = context.createGain();
  wobbleDepth.gain.value = RUMBLE_PITCH[0][1] * 0.12;
  wobble.connect(wobbleDepth).connect(buzz.frequency);

  buzz.connect(fluttered).connect(envelope);
  for (const oscillator of [buzz, flutter, wobble]) {
    oscillator.start(start);
    oscillator.stop(end + 0.05);
  }
}
