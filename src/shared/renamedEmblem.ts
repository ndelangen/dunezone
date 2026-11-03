/*
 * A faction's logo is being renamed to its emblem (the glossary term), in two releases.
 * The next release stores it under an `emblem` key and moves the stock artwork from `/vector/logo/` to `/vector/emblem/`.
 * Its Convex functions go live 15 to 40 minutes before its browser bundle and Workers do (see AGENTS.md on expand/contract),
 * so this release teaches the readers that lag behind to take the new names where each runtime receives Convex answers:
 * the browser's Convex client, the HTTP clients the server render and the game Worker use, the publisher Worker's executor calls and the capture page.
 * The next release removes this module.
 */

const RENAMED_PREFIX = '/vector/emblem/';
const CURRENT_PREFIX = '/vector/logo/';

/** Only plain objects are rebuilt: bytes, dates, files and other class instances pass through as they are. */
function isPlainRecord(input: unknown): input is Record<string, unknown> {
  if (typeof input !== 'object' || input === null) {
    return false;
  }
  const prototype = Object.getPrototypeOf(input);
  return prototype === Object.prototype || prototype === null;
}

function readRenamedPath(input: string): string {
  return input.startsWith(RENAMED_PREFIX) ? CURRENT_PREFIX + input.slice(RENAMED_PREFIX.length) : input;
}

/* Convex hands a watched query the same answer object until it changes, so a rewritten copy is kept per answer and a component sees a stable value. */
const rewritten = new WeakMap<object, unknown>();

function remembered<Value extends object>(input: Value, read: (input: Value) => unknown): unknown {
  if (!rewritten.has(input)) {
    rewritten.set(input, read(input));
  }
  return rewritten.get(input);
}

function readRenamedList(input: readonly unknown[]): readonly unknown[] {
  const read = input.map(readRenamedEmblems);
  return read.some((value, index) => value !== input[index]) ? read : input;
}

function readRenamedRecord(input: Record<string, unknown>): Record<string, unknown> {
  const hasCurrent = 'logo' in input;
  const entries = Object.entries(input).flatMap(([key, value]): [string, unknown][] => {
    if (key !== 'emblem') {
      return [[key, readRenamedEmblems(value)]];
    }
    return hasCurrent ? [] : [['logo', readRenamedEmblems(value)]];
  });
  const unchanged = !('emblem' in input) && entries.every(([key, value]) => value === input[key]);
  return unchanged ? input : Object.fromEntries(entries);
}

/**
 * A value from a newer release as this release reads it, at any depth: `emblem` keys become `logo`, `/vector/emblem/` paths become `/vector/logo/`.
 * A value that already has `logo` keeps it and loses the new key.
 * Nothing in this release's data is called `emblem`, so the rewrite cannot meet an unrelated key.
 * Whatever needs no rename comes back as the same reference, so today's data passes through without a copy.
 */
export function readRenamedEmblems(input: unknown): unknown {
  if (Array.isArray(input)) {
    return remembered(input, readRenamedList);
  }
  if (isPlainRecord(input)) {
    return remembered(input, readRenamedRecord);
  }
  return typeof input === 'string' ? readRenamedPath(input) : input;
}

type Method = (...args: never[]) => unknown;

/**
 * Has a Convex client answer under this release's names: each named method keeps its signature and has its result read through `readRenamedEmblems`.
 * Wrapped on the instance rather than overridden, because the client's methods are generic over the function they call.
 */
export function readingRenamedEmblems<Client extends object>(
  client: Client,
  asyncMethods: readonly (keyof Client & string)[]
): Client {
  const methods = client as unknown as Record<string, Method>;
  for (const name of asyncMethods) {
    /* A stand-in client, such as Storybook's, may leave a method out. */
    const method = methods[name];
    if (typeof method !== 'function') {
      continue;
    }
    const original = method.bind(client);
    methods[name] = async (...args: never[]) => readRenamedEmblems(await original(...args));
  }
  return client;
}
