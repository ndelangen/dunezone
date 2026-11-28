/*
 * What the game engine takes from the host that runs it: the clock, randomness and card-identity signing.
 * Four hosts run the engine (#2852): the game Worker's rooms and its homepage table supply Node's crypto and the Worker's
 * clock (`workers/game/engineHost.ts`); the tutorial and Play / Sandbox supply Web Crypto and the page's clock
 * (`src/app/routes/_app/tutorial/table/engineHost.ts`). No engine file reads `Date.now()` or a crypto module itself, and
 * the boundary in `.oxlintrc.json` keeps it that way.
 *
 * A host installs its object once, before it builds a Room or a session, and a test installs a fixed clock or a seeded
 * random the same way instead of patching globals.
 */

export type EngineHost = Readonly<{
  /** Milliseconds since the epoch, as the host's clock reads now. */
  now: () => number;
  /** A uniform integer in [0, max), for 0 < max <= 2^32. */
  randomInt: (max: number) => number;
  /** A fresh random UUID. */
  randomUUID: () => string;
  /** The HMAC-SHA256 of `message` under `key`, as lower-case hex. It is synchronous, since a projection signs every card it shows. */
  hmacSha256: (key: string, message: string) => string;
}>;

let installed: EngineHost | undefined;

/** Installs the host the engine reads from now on; a later install replaces it. */
export function installEngineHost(host: EngineHost) {
  installed = host;
}

/** The installed host. Building a table before any host is installed is a host's bug, so it throws. */
export function engineHost(): EngineHost {
  if (!installed) {
    throw new Error('No engine host is installed. Call installEngineHost before running the game engine.');
  }
  return installed;
}

/** The host's clock. */
export const hostNow = () => engineHost().now();
/** A uniform integer in [0, max) from the host. */
export const hostRandomInt = (max: number) => engineHost().randomInt(max);
/** A fresh random UUID from the host. */
export const hostRandomUUID = () => engineHost().randomUUID();
