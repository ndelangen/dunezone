import { viewerChoice } from './viewerPreference';

/*
 * The table's sounds, made in the browser so they need no file, all through one volume this viewer sets in the game menu
 * (Norbert, 2026-11-17, #2982). A page that has had no click or key yet may not play sound, as browsers allow; it stays silent.
 */

export const TABLE_VOLUME_MAX = 1;
const volume = viewerChoice<number>('dunezone-table-volume', {
  parse: (stored) => {
    const number = stored === null ? Number.NaN : Number(stored);
    return Number.isFinite(number) ? Math.min(TABLE_VOLUME_MAX, Math.max(0, number)) : 0.7;
  },
  serialize: String,
  fallback: 0.7,
});

export const setTableVolume = (next: number) => volume.set(Math.min(TABLE_VOLUME_MAX, Math.max(0, next)));
/** This viewer's sound volume, from 0 (muted) to TABLE_VOLUME_MAX. */
export const useTableVolume = volume.use;

let audio: AudioContext | null = null;

/** The running audio context and its output at this viewer's volume, or null while sound can't play or is muted. */
export function tableAudio(): { context: AudioContext; output: AudioNode } | null {
  try {
    const level = volume.read();
    if (level <= 0) {
      return null;
    }
    audio ??= new AudioContext();
    if (audio.state !== 'running') {
      /* A suspended context keeps its clock still, so tones scheduled now would all sound at once when it starts: this one stays silent. */
      void audio.resume().catch(() => undefined);
      return null;
    }
    const output = audio.createGain();
    output.gain.value = level;
    output.connect(audio.destination);
    return { context: audio, output };
  } catch {
    /* A browser without Web Audio stays silent. */
    return null;
  }
}

type Note = Readonly<{ frequency: number; at: number; peak: number; decay: number }>;

/* Soft sine notes with a gentle attack, so none of them startles. */
function playNotes(notes: readonly Note[]) {
  const sound = tableAudio();
  if (!sound) {
    return;
  }
  const { context, output } = sound;
  const start = context.currentTime + 0.01;
  for (const { frequency, at, peak, decay } of notes) {
    const time = start + at;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, time);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(peak, time + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + decay);
    oscillator.connect(gain).connect(output);
    oscillator.start(time);
    oscillator.stop(time + decay + 0.05);
  }
}

/** The sounds the table makes besides pings: a reminder to ready up, and new chat messages by where they were written. */
export type TableSound = 'ready' | 'chat-table' | 'chat-ally' | 'chat-other' | 'mention';

const SOUNDS: Readonly<Record<TableSound, readonly Note[]>> = {
  /* Two rising notes: the table waits on you. */
  ready: [
    { frequency: 660, at: 0, peak: 0.12, decay: 0.35 },
    { frequency: 990, at: 0.16, peak: 0.12, decay: 0.5 },
  ],
  /* One low, short blip for the table's chat. */
  'chat-table': [{ frequency: 740, at: 0, peak: 0.07, decay: 0.22 }],
  /* Two quick falling notes for your ally. */
  'chat-ally': [
    { frequency: 1046, at: 0, peak: 0.08, decay: 0.2 },
    { frequency: 784, at: 0.09, peak: 0.08, decay: 0.28 },
  ],
  /* Two quick rising notes for a one-to-one chat with any other faction. */
  'chat-other': [
    { frequency: 587, at: 0, peak: 0.08, decay: 0.2 },
    { frequency: 880, at: 0.09, peak: 0.08, decay: 0.28 },
  ],
  /* Three bright notes when someone names your faction. */
  mention: [
    { frequency: 880, at: 0, peak: 0.09, decay: 0.2 },
    { frequency: 1108, at: 0.08, peak: 0.09, decay: 0.2 },
    { frequency: 1318, at: 0.16, peak: 0.09, decay: 0.35 },
  ],
};

export function playTableSound(sound: TableSound) {
  playNotes(SOUNDS[sound]);
}
