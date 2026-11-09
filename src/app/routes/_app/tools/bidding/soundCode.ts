/*
 * Sound remotes (Norbert, 2026-11-09): a player's phone plays a short tune, and the tablet in the middle of the table
 * hears it and knows who bid what; the tablet's own tune tells a phone it is its turn. No network, no pairing.
 * This is what the sounds say; noteTunes.ts and clockTicks.ts are how they sound. A remote's command is four symbols, each 0 to 15:
 * the seat, the amount in two parts (0 to 255) and a check that catches a misheard symbol. The tablet's call is five:
 * the seat, the seconds to answer, the bid to beat in two parts, and a check.
 */

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
/**
 * The tablet's call: whose bid it is, the bid to beat and the seconds per bid.
 * A `welcome` call instead tells that seat's phone the tablet heard it link (Norbert, 2026-11-09: a phone must know whether it is really connected).
 */
export type Call = Readonly<{ seat: number; beat: number; seconds: number; welcome?: boolean }>;

/* The seconds symbol that marks a welcome; bid timers run 5 to 70 seconds. */
const WELCOME = 15;
export const MAX_SECONDS = 70;

/* Seconds go in steps of five, up to 75. */
const SECONDS_STEP = 5;

export function encodeCall(call: Call): number[] {
  const seconds = call.welcome
    ? WELCOME
    : Math.min(MAX_SECONDS / SECONDS_STEP, Math.round(call.seconds / SECONDS_STEP));
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
  if (seconds === WELCOME) {
    return { seat: seat!, beat: 0, seconds: 0, welcome: true };
  }
  return { seat: seat!, beat: high! * 16 + low!, seconds: seconds! * SECONDS_STEP };
}
