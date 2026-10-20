import { assertPublisherFontFaces, requiredPublisherFontFaces } from '@shared/asset-publishing/publisher-fonts';
import { useLayoutEffect } from 'react';
import type { RefObject } from 'react';

export function singleLineTitle(text: string): string {
  return text.replaceAll(/\s+/gu, ' ').trim();
}

type Measurement = { width: number; height: number };

/** Both DOM adapters measure native units and start at the normal size on every fit. */
export function fitCardTitle(
  baseSize: number,
  width: number,
  height: number,
  measure: (size: number) => Measurement
): number {
  let size = baseSize;
  for (let pass = 0; pass < 8; pass++) {
    const actual = measure(size);
    const ratio = Math.min(
      1,
      actual.width > 0 ? width / actual.width : 1,
      actual.height > 0 ? height / actual.height : 1
    );
    if (ratio >= 1) {
      return size;
    }
    size *= ratio * 0.9999;
  }
  measure(size);
  return size;
}

type TitleFit = { element: Element; fit: () => void; fonts: () => Promise<void> };
const titles = new Set<TitleFit>();

async function loadTitleFont(element: Element): Promise<void> {
  const style = getComputedStyle(element);
  const family = style.fontFamily.split(',')[0]!.replaceAll(/["']/g, '').trim();
  const faces = requiredPublisherFontFaces.filter((face) => face.family === family);
  if (faces.length === 0) {
    throw new Error(`Card title font is outside the publisher font contract: ${family}`);
  }
  await assertPublisherFontFaces(document.fonts, faces);
  // The declared face can supply synthetic bold, as it does for the existing Trebuchet subtitle.
  await document.fonts.load(`${style.fontStyle} ${style.fontWeight} 16px "${family}"`, element.textContent ?? '');
}

function withAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) {
    return promise;
  }
  signal.throwIfAborted();
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    void promise.then(
      (value) => {
        signal.removeEventListener('abort', abort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', abort);
        reject(error);
      }
    );
  });
}

/** The existing publisher readiness flow awaits this before geometry and CAPTURE_PROTOCOL ready. */
export async function settleCardTitles(root: ParentNode = document, signal?: AbortSignal): Promise<void> {
  const current = () => [...titles].filter(({ element }) => root.contains(element));
  let active: TitleFit[];
  do {
    signal?.throwIfAborted();
    active = current();
    await withAbort(Promise.all(active.map((title) => title.fonts())), signal);
    signal?.throwIfAborted();
    for (const title of active) {
      if (titles.has(title) && root.contains(title.element)) {
        title.fit();
      }
    }
    await withAbort(new Promise<void>((resolve) => requestAnimationFrame(() => resolve())), signal);
    signal?.throwIfAborted();
    // A name or style changed while fonts loaded. Settle that registration too.
  } while (current().some((title) => !active.includes(title)));
}

/** Registers the actual painted node, including titles mounted inside scaled previews. */
export function useCardTitleFit<T extends Element>(ref: RefObject<T | null>, fit: (element: T) => void): void {
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    const title: TitleFit = { element, fit: () => fit(element), fonts: () => loadTitleFont(element) };
    titles.add(title);
    let disposed = false;
    const refit = () => {
      if (!disposed) {
        title.fit();
      }
    };
    refit();
    void title.fonts().then(refit, () => {
      // Publisher settlement reports font failures through its existing failed-capture path.
    });
    document.fonts.addEventListener('loadingdone', refit);
    const observer = new ResizeObserver(refit);
    observer.observe(element);
    return () => {
      disposed = true;
      titles.delete(title);
      observer.disconnect();
      document.fonts.removeEventListener('loadingdone', refit);
    };
  });
}
