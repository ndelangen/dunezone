import { useEffect } from 'react';

/* How many faces download at once, so the table's own images are not held behind a long preload. */
const PARALLEL_LOADS = 4;

/*
 * Every card face an open table asked for.
 * Holding the image keeps it in the browser's memory cache, so a face shown later is drawn from there instead of fetched again.
 * Published images are served `no-cache`, so the memory cache is what spares a reveal its round trip.
 * A table that asks for its faces lets go of those no open table wants, so the faces of games already left do not add up
 * for the page's life, while going back to the game just left still finds its faces.
 */
const requested = new Map<string, HTMLImageElement>();
const queue: string[] = [];
let loading = 0;
/* The faces each open table asked for. */
const tables = new Map<object, readonly string[]>();
let dropPending = false;

function loadNext() {
  while (loading < PARALLEL_LOADS && queue.length > 0) {
    const href = queue.shift()!;
    const image = new Image();
    /* The same mode the table's texture loader asks for, so its later request finds this one in the cache. */
    image.crossOrigin = 'anonymous';
    image.decoding = 'async';
    loading++;
    const settle = () => {
      loading--;
      loadNext();
    };
    image.addEventListener('load', settle, { once: true });
    image.addEventListener('error', settle, { once: true });
    image.src = href;
    requested.set(href, image);
  }
}

/** Starts downloading each card face not yet asked for, a few at a time. */
function preloadCardFaces(hrefs: readonly string[]) {
  for (const href of hrefs) {
    if (!requested.has(href) && !queue.includes(href)) {
      queue.push(href);
    }
  }
  loadNext();
}

/*
 * Lets go of every face no open table asked for, once the effects of this commit have run.
 * React runs every cleanup of a commit before any setup, so a table whose faces are only being replaced is not yet
 * listed while an earlier table's setup runs.
 */
function dropUnwantedFacesSoon() {
  if (!dropPending) {
    dropPending = true;
    queueMicrotask(dropUnwantedFaces);
  }
}

function dropUnwantedFaces() {
  dropPending = false;
  /* With no table open, the last game left keeps its faces until a table asks for others. */
  if (tables.size === 0) {
    return;
  }
  const wanted = new Set([...tables.values()].flat());
  for (const href of requested.keys()) {
    if (!wanted.has(href)) {
      requested.delete(href);
    }
  }
  const stillWanted = queue.filter((href) => wanted.has(href));
  queue.splice(0, queue.length, ...stillWanted);
}

/**
 * Downloads every card face in the game while the table is open, so a card turned up shows its face at once instead of fetching it then.
 * The room sends the whole set sorted, so loading it tells nobody which card lies where.
 */
export function usePreloadedCardFaces(hrefs: readonly string[] | undefined) {
  useEffect(() => {
    if (!hrefs?.length) {
      return;
    }
    const table = {};
    tables.set(table, hrefs);
    preloadCardFaces(hrefs);
    dropUnwantedFacesSoon();
    return () => {
      tables.delete(table);
    };
  }, [hrefs]);
}
