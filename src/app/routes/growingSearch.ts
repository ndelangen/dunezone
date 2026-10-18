import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

export type GrowingSearchOptions<Args, Data> = {
  /** What is searched, as the query takes it; a change starts again at the first step. */
  args: Args;
  /** How many rows a search shows at first, and how many more each "Load more" asks for. */
  step: number;
  /** The loader's answer for `args` at the first step, shown until the live one arrives. */
  initial: Data;
  /** The live answer for `args` at a limit: a hook, called once a render. */
  useLive: (args: Args, limit: number) => Data | undefined;
  /** How many rows an answer shows. */
  rows: (data: Data) => number;
};

/** How many rows were shown when "Load more" was pressed: the first new row is the one after them. */
export type GrownFrom = { from: number };

/**
 * The rows a search shows, grown by "Load more" and kept on screen while a longer list loads;
 * a new search starts at its first matches.
 * The limit is the page's own, not the address's: it starts again whenever the search changes, and does not come back with the search.
 * The last answer stays on screen while a longer list loads, so the rows and the button keep their place.
 */
export function useGrowingSearch<Args, Data>({ args, step, initial, useLive, rows }: GrowingSearchOptions<Args, Data>) {
  const key = JSON.stringify(args);
  const [grown, setGrown] = useState({ key, limit: step, from: -1 });
  /* Reset during render, so a search that comes back after another starts at its first matches like any other. */
  if (grown.key !== key) {
    setGrown({ key, limit: step, from: -1 });
  }
  const limit = grown.key === key ? grown.limit : step;
  const live = useLive(args, limit);
  const [shown, setShown] = useState({ key, data: initial });
  if (live !== undefined && live !== shown.data) {
    setShown({ key, data: live });
  }
  const data = live ?? (shown.key === key ? shown.data : initial);
  const loading = live === undefined && limit > step;
  const loaded = grown.key === key && grown.from >= 0 && rows(data) > grown.from;
  const loadMore = () => setGrown({ key, limit: limit + step, from: rows(data) });
  return { data, loading, loaded, grown, loadMore };
}

/**
 * Moves focus to the first new row once per press, however often the longer list is answered again, so a keyboard reader carries on from where the list grew.
 * `rowSelector` names the rows within `list`, in their order.
 */
export function useFocusFirstNewRow(
  list: RefObject<HTMLElement | null>,
  loaded: boolean,
  grown: GrownFrom,
  rowSelector: string
) {
  const focusedFor = useRef<GrownFrom>(null);
  useEffect(() => {
    if (!loaded || focusedFor.current === grown) {
      return;
    }
    focusedFor.current = grown;
    list.current?.querySelectorAll<HTMLElement>(rowSelector)[grown.from]?.focus();
  }, [list, loaded, grown, rowSelector]);
}
