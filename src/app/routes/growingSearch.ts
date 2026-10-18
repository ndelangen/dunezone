import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

/** How many rows were shown when "Load more" was pressed: the first new row is the one after them. */
export type GrownFrom = { from: number };

/** The limit a search is shown at, grown by "Load more" and starting again at one step whenever the search changes. */
export function useGrowingLimit(args: unknown, step: number) {
  const key = JSON.stringify(args);
  const [grown, setGrown] = useState({ key, limit: step, from: -1 });
  /* Reset during render, so a search that comes back after another starts at its first matches like any other. */
  if (grown.key !== key) {
    setGrown({ key, limit: step, from: -1 });
  }
  const limit = grown.key === key ? grown.limit : step;
  const grow = (from: number) => setGrown({ key, limit: limit + step, from });
  return { key, grown, limit, grow, step };
}

/** The answer on screen: the live one, else the last one shown for this search, else the loader's. */
function useShownAnswer<Data>(key: string, live: Data | undefined, initial: Data) {
  const [shown, setShown] = useState({ key, data: initial });
  if (shown.key !== key || (live !== undefined && live !== shown.data)) {
    if (live === undefined) {
      setShown({ key, data: initial });
    } else {
      setShown({ key, data: live });
    }
  }
  return live ?? (shown.key === key ? shown.data : initial);
}

/**
 * The rows a search shows, grown by "Load more" and kept on screen while a longer list loads;
 * a new search starts at its first matches.
 * The limit is the page's own, not the address's: it starts again whenever the search changes, and does not come back with the search.
 * The last answer stays on screen while a longer list loads, so the rows and the button keep their place.
 */
export function useGrowingSearch<Data>({
  search,
  initial,
  live,
  rows,
}: {
  search: ReturnType<typeof useGrowingLimit>;
  initial: Data;
  live: Data | undefined;
  rows: (data: Data) => number;
}) {
  const { key, grown, limit, grow, step } = search;
  const data = useShownAnswer(key, live, initial);
  const loading = live === undefined && limit > step;
  const loaded = grown.key === key && grown.from >= 0 && rows(data) > grown.from;
  return { data, loading, loaded, grown, loadMore: () => grow(rows(data)) };
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
