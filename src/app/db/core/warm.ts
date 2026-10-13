import type { ConvexReactClient } from 'convex/react';
import { getFunctionName } from 'convex/server';
import type { FunctionArgs, FunctionReference } from 'convex/server';
import { convexToJson } from 'convex/values';

/*
 * How long the browser keeps a query subscribed after the last reader let go of it. Navigating back to a page, or a
 * loader asking for what a page just showed, then reads the client's local result instead of running the query again on
 * the server; the held subscription still follows every change meanwhile. A loader's own result, often a hover preload,
 * is held only long enough to cover the click that follows. Convex's own `prewarmQuery` cannot extend a hold it already
 * opened, which is why this keeps its own.
 */
export const PAGE_HOLD_MS = 2 * 60_000;
export const LOADER_HOLD_MS = 30_000;
/* Sweeping the pointer over a long list preloads every link; past this many holds the oldest is released. */
const HOLD_LIMIT = 32;
const warm = new Map<string, { unsubscribe: () => void; timer: ReturnType<typeof setTimeout>; until: number }>();

function release(key: string) {
  const held = warm.get(key);
  if (held) {
    clearTimeout(held.timer);
    held.unsubscribe();
    warm.delete(key);
  }
}

/** Holds a query's subscription open for at least `holdMs` from now, extending a hold that is already open but never shortening it. */
export function keepWarm<Query extends FunctionReference<'query'>>(
  client: Pick<ConvexReactClient, 'watchQuery'> | undefined,
  fn: Query,
  args: FunctionArgs<Query>,
  holdMs: number
) {
  if (typeof client?.watchQuery !== 'function') {
    return;
  }
  const key = JSON.stringify([getFunctionName(fn), convexToJson(args)]);
  const until = Date.now() + holdMs;
  const held = warm.get(key);
  if (held) {
    warm.delete(key);
    if (until > held.until) {
      clearTimeout(held.timer);
      held.timer = setTimeout(() => release(key), holdMs);
      held.until = until;
    }
    warm.set(key, held);
    return;
  }
  const unsubscribe = client.watchQuery(fn, args as never).onUpdate(() => undefined);
  warm.set(key, { unsubscribe, timer: setTimeout(() => release(key), holdMs), until });
  for (const oldest of warm.keys()) {
    if (warm.size <= HOLD_LIMIT) {
      break;
    }
    release(oldest);
  }
}
