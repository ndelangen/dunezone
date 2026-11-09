/*
 * Sound remotes (Norbert, 2026-11-09): a player's phone plays a short tune, and the tablet in the middle of the table
 * hears it and knows who bid what. No network, no pairing: the phone's speaker is the remote, the tablet's microphone
 * the receiver.
 *
 * The tune is five tones, each from a fixed set, with a short silence between them so two equal tones in a row still
 * count twice: a start tone, the seat (0 to 15), the amount in two parts (0 to 255), and a check tone that catches a
 * misheard one. Every tone sits between 1.5 and 4.2 kHz, where phone speakers and microphones are both at their best
 * and a table's chatter is quiet. The whole tune takes about two thirds of a second.
 */

/** The tone that starts every message. */
export const START_HZ = 1500;
/** The sixteen tones a symbol can be, 150 Hz apart: wide enough for a phone speaker's wobble and the tablet's FFT. */
export const SYMBOL_HZ: readonly number[] = Array.from({ length: 16 }, (_, index) => 1800 + index * 150);

export const TONE_MS = 90;
export const GAP_MS = 50;

/** What a remote can say: a bid of an amount, a pass, or one more than the bid to beat. */
export type RemoteCommand =
  | Readonly<{ seat: number; kind: 'bid'; amount: number }>
  | Readonly<{ seat: number; kind: 'pass' }>
  | Readonly<{ seat: number; kind: 'raise' }>;

const PASS = 0;
const RAISE = 255;

/** The symbols after the start tone, each 0 to 15. */
export function encode(command: RemoteCommand): number[] {
  const value = command.kind === 'pass' ? PASS : command.kind === 'raise' ? RAISE : command.amount;
  if (command.seat < 0 || command.seat > 15 || value < 0 || value > 255) {
    throw new RangeError('A seat is 0 to 15 and an amount 1 to 254.');
  }
  const high = value >> 4;
  const low = value & 15;
  return [command.seat, high, low, check(command.seat, high, low)];
}

/* A check that changes with any one symbol misheard, and with two symbols heard in the wrong order. */
const check = (seat: number, high: number, low: number) => (seat * 3 + high * 5 + low * 7 + 11) % 16;

/** The command four symbols carry, or undefined when the check does not hold. */
export function decode(symbols: readonly number[]): RemoteCommand | undefined {
  const [seat, high, low, sum] = symbols;
  if (symbols.length !== 4 || seat === undefined || high === undefined || low === undefined) {
    return undefined;
  }
  if (sum !== check(seat, high, low)) {
    return undefined;
  }
  const value = high * 16 + low;
  if (value === PASS) {
    return { seat, kind: 'pass' };
  }
  return value === RAISE ? { seat, kind: 'raise' } : { seat, kind: 'bid', amount: value };
}

/** What the tablet hears in one moment: the start tone, a symbol, or nothing it knows. */
export type Tone = 'start' | number | null;

/* How many moments in a row a tone must sound to count: a clap or a fork on a plate is shorter. */
const STEADY = 3;
/* How many silent moments end a message that never finished. */
const GIVE_UP = 30;

/**
 * Reads tones as they are heard, a moment at a time (about every 10 ms), and hands over each whole message.
 * A tone counts once it has sounded steadily;
 * it counts again only after silence or another tone.
 */
export class ToneReader {
  private current: Tone = null;
  private run = 0;
  private counted = false;
  private symbols: number[] | null = null;
  private quiet = 0;

  constructor(
    private readonly onMessage: (command: RemoteCommand) => void,
    private readonly onMisheard?: () => void
  ) {}

  hear(tone: Tone) {
    if (tone === this.current) {
      this.run += 1;
    } else {
      this.current = tone;
      this.run = 1;
      this.counted = false;
    }
    if (tone === null) {
      this.quiet += 1;
      if (this.symbols && this.quiet > GIVE_UP) {
        this.symbols = null;
        this.onMisheard?.();
      }
      return;
    }
    this.quiet = 0;
    if (this.counted || this.run < STEADY) {
      return;
    }
    this.counted = true;
    if (tone === 'start') {
      this.symbols = [];
      return;
    }
    if (!this.symbols) {
      return;
    }
    this.symbols.push(tone);
    if (this.symbols.length === 4) {
      const command = decode(this.symbols);
      this.symbols = null;
      if (command) {
        this.onMessage(command);
      } else {
        this.onMisheard?.();
      }
    }
  }
}

/** The tones a message plays, in order: the start tone, then its symbols. */
export function tune(command: RemoteCommand): number[] {
  return [START_HZ, ...encode(command).map((symbol) => SYMBOL_HZ[symbol]!)];
}

/** How long a message takes to play, in milliseconds. */
export const TUNE_MS = 5 * (TONE_MS + GAP_MS);
