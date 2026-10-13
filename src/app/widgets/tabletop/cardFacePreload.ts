import { useEffect } from 'react';

/* How many faces download at once, so the table's own images are not held behind a long preload. */
const PARALLEL_LOADS = 4;

/*
 * Every card face an open table asked for, kept while any table is open.
 * Holding the image keeps it in the browser's memory cache, so a face shown later is drawn from there instead of fetched again.
 * Published images are served `no-cache`, so the memory cache is what spares a reveal its round trip.
 * Once the last table closes they are let go, so the faces of games already left do not add up for the page's life.
 */
const requested = new Map<string, HTMLImageElement>();
const queue: string[] = [];
let loading = 0;
let openTables = 0;

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

/** Counts an open table; the returned release lets every face go once no table is open. */
function holdFaces() {
  openTables++;
  return () => {
    openTables--;
    if (openTables === 0) {
      queue.length = 0;
      requested.clear();
    }
  };
}

/**
 * Downloads every card face in the game while the table is open, so a card turned up shows its face at once instead of fetching it then.
 * The room sends the whole set sorted, so loading it tells nobody which card lies where.
 */
export function usePreloadedCardFaces(hrefs: readonly string[] | undefined) {
  useEffect(holdFaces, []);
  useEffect(() => {
    if (hrefs?.length) {
      preloadCardFaces(hrefs);
    }
  }, [hrefs]);
}
