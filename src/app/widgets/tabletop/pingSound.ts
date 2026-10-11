/*
 * The ping's sound, made in the browser so it needs no file: a short bright tone that falls away, with a softer one an octave up.
 * A page that has had no click or key yet may not play sound, as browsers allow; the ping still shows.
 */
let audio: AudioContext | null = null;

const TONES = [
  { frequency: 1480, peak: 0.16 },
  { frequency: 2960, peak: 0.04 },
] as const;
const ATTACK_S = 0.008;
const DECAY_S = 0.55;

export function playPingSound() {
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') {
      void audio.resume().catch(() => undefined);
    }
    const now = audio.currentTime;
    for (const { frequency, peak } of TONES) {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, now);
      oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.92, now + DECAY_S);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(peak, now + ATTACK_S);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + DECAY_S);
      oscillator.connect(gain).connect(audio.destination);
      oscillator.start(now);
      oscillator.stop(now + DECAY_S + 0.05);
    }
  } catch {
    /* A browser without Web Audio shows the ping silently. */
  }
}
