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

/** The tone that starts a remote's message to the tablet. */
export const START_HZ = 1500;
/** The tone that starts the tablet's call to a remote: whose bid it is, the bid to beat and the time to answer. */
export const CALL_HZ = 1350;
/** The sixteen tones a symbol can be, 150 Hz apart: wide enough for a phone speaker's wobble and the tablet's FFT. */
export const SYMBOL_HZ: readonly number[] = Array.from({ length: 16 }, (_, index) => 1800 + index * 150);

export const TONE_MS = 90;
export const GAP_MS = 50;

/** What a remote can say: a bid of an amount, a pass, or one more than the bid to beat. */
export type RemoteCommand =
  | Readonly<{ seat: number; kind: 'bid'; amount: number }>
  | Readonly<{ seat: number; kind: 'pass' }>
  | Readonly<{ seat: number; kind: 'raise' }>
  /** A phone joins the table as this seat's remote. */
  | Readonly<{ seat: number; kind: 'join' }>;

const PASS = 0;
const JOIN = 254;
const RAISE = 255;

/** The symbols after the start tone, each 0 to 15. */
export function encode(command: RemoteCommand): number[] {
  const value =
    command.kind === 'pass' ? PASS : command.kind === 'raise' ? RAISE : command.kind === 'join' ? JOIN : command.amount;
  if (command.seat < 0 || command.seat > 15 || value < 0 || value > 255 || (command.kind === 'bid' && value >= JOIN)) {
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
  if (value === JOIN) {
    return { seat, kind: 'join' };
  }
  return value === RAISE ? { seat, kind: 'raise' } : { seat, kind: 'bid', amount: value };
}

/** The tablet's call: whose bid it is, the bid to beat, and the seconds to answer (0 when untimed). */
export type Call = Readonly<{ seat: number; beat: number; seconds: number }>;

/* Seconds go in steps of five, up to 75. */
const SECONDS_STEP = 5;

export function encodeCall(call: Call): number[] {
  const seconds = Math.min(15, Math.round(call.seconds / SECONDS_STEP));
  const beat = Math.min(253, call.beat);
  const high = beat >> 4;
  const low = beat & 15;
  return [call.seat, seconds, high, low, (check(call.seat, high, low) + seconds * 13) % 16];
}

export function decodeCall(symbols: readonly number[]): Call | undefined {
  const [seat, seconds, high, low, sum] = symbols;
  if (symbols.length !== 5 || [seat, seconds, high, low].some((symbol) => symbol === undefined)) {
    return undefined;
  }
  if (sum !== (check(seat!, high!, low!) + seconds! * 13) % 16) {
    return undefined;
  }
  return { seat: seat!, beat: high! * 16 + low!, seconds: seconds! * SECONDS_STEP };
}

/** What the tablet hears in one moment: the start tone, a symbol, or nothing it knows. */
export type Tone = 'start' | 'call' | number | null;

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
    private readonly onSymbols: (symbols: number[]) => void,
    private readonly onMisheard?: () => void,
    /** Which message it reads: the remotes' commands or the tablet's calls. */
    private readonly kind: 'start' | 'call' = 'start'
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
    if (tone === 'start' || tone === 'call') {
      this.symbols = tone === this.kind ? [] : null;
      return;
    }
    if (!this.symbols) {
      return;
    }
    this.symbols.push(tone);
    if (this.symbols.length === (this.kind === 'start' ? 4 : 5)) {
      const symbols = this.symbols;
      this.symbols = null;
      this.onSymbols(symbols);
    }
  }
}

/** Reads the remotes' commands, handing over each that holds together. */
export function commandReader(onCommand: (command: RemoteCommand) => void, onMisheard?: () => void) {
  return new ToneReader(
    (symbols) => {
      const command = decode(symbols);
      if (command) {
        onCommand(command);
      } else {
        onMisheard?.();
      }
    },
    onMisheard,
    'start'
  );
}

/** Reads the tablet's calls, handing over each that holds together. */
export function callReader(onCall: (call: Call) => void) {
  return new ToneReader(
    (symbols) => {
      const call = decodeCall(symbols);
      if (call) {
        onCall(call);
      }
    },
    undefined,
    'call'
  );
}

/** The tones a message plays, in order: the start tone, then its symbols. */
export function tune(command: RemoteCommand): number[] {
  return [START_HZ, ...encode(command).map((symbol) => SYMBOL_HZ[symbol]!)];
}

/** The tones the tablet's call plays. */
export function callTune(call: Call): number[] {
  return [CALL_HZ, ...encodeCall(call).map((symbol) => SYMBOL_HZ[symbol]!)];
}

/** How long a message takes to play, in milliseconds. */
export const TUNE_MS = 5 * (TONE_MS + GAP_MS);
