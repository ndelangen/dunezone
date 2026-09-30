/**
 * The hosted browser flows the launcher runs against one stack, each on a fresh game.
 * It stays free of side effects, because the browser driver parses arguments and launches Chromium on import.
 */
export const browserFlows = {
  /* The regular flow steps through every phase and readies both players at each Mentat pause, so it has the longest budget. */
  regular: {
    timeoutMs: 600_000,
    separateBrowsers: false,
    keepsFrames: false,
    needsCatalogue: false,
    checksPhaseCooldown: false,
    startsInPlay: false,
    shard: 'regular',
  },
  /* Every other flow tests play itself, so its games arrive at Turn 1 already provisioned through drafting and setup. */
  'public-controls': {
    timeoutMs: 480_000,
    separateBrowsers: false,
    keepsFrames: false,
    needsCatalogue: true,
    checksPhaseCooldown: true,
    startsInPlay: true,
    shard: 'catalogue',
  },
  'private-banks': {
    timeoutMs: 480_000,
    separateBrowsers: true,
    keepsFrames: true,
    needsCatalogue: false,
    checksPhaseCooldown: false,
    startsInPlay: true,
    shard: 'protocol',
  },
  battles: {
    timeoutMs: 480_000,
    separateBrowsers: true,
    keepsFrames: true,
    needsCatalogue: true,
    checksPhaseCooldown: false,
    startsInPlay: true,
    shard: 'catalogue',
  },
  decks: {
    timeoutMs: 480_000,
    separateBrowsers: true,
    keepsFrames: true,
    needsCatalogue: false,
    checksPhaseCooldown: false,
    startsInPlay: true,
    shard: 'protocol',
  },
  /* Steps to Mentat pause, then declares, reloads and continues. */
  results: {
    timeoutMs: 480_000,
    separateBrowsers: false,
    keepsFrames: false,
    needsCatalogue: false,
    checksPhaseCooldown: false,
    startsInPlay: true,
    shard: 'protocol',
  },
} satisfies Record<
  string,
  {
    timeoutMs: number;
    /** Player B runs in its own Chromium process, so private state cannot cross a shared browser. */
    separateBrowsers: boolean;
    /** Received game frames are retained as `${flow}-frames.json` for audience inspection. */
    keepsFrames: boolean;
    /** The flow selects the seeded public catalogue's token by exact name, so the stack seeds it once. */
    needsCatalogue: boolean;
    /**
     * The flow checks the phase cooldown, so its games keep the real one.
     * The launcher provisions every other flow's games with no cooldown.
     */
    checksPhaseCooldown: boolean;
    /**
     * The flow's games are provisioned past drafting and setup, at Turn 1, so it starts where its own checks begin (#1594).
     * The launcher sets the backend's test-only `PLAY_TEST_START_STAGE` for it.
     * `regular` keeps the real start, because stepping through those stages is what it proves.
     */
    startsInPlay: boolean;
    /**
     * The `hosted_play` CI shard that runs the flow, which the launcher's `--shard` selects.
     * A shard seeds the public catalogue when one of its flows needs it, so the flows that need it share `catalogue`.
     */
    shard: 'regular' | 'catalogue' | 'protocol';
  }
>;

export type BrowserFlow = keyof typeof browserFlows;

export function isBrowserFlow(name: string): name is BrowserFlow {
  return Object.hasOwn(browserFlows, name);
}

/** The flows one `hosted_play` CI shard runs, in the order above; none for a name no flow carries. */
export function flowsInShard(shard: string): BrowserFlow[] {
  return Object.keys(browserFlows)
    .filter(isBrowserFlow)
    .filter((flow) => browserFlows[flow].shard === shard);
}
