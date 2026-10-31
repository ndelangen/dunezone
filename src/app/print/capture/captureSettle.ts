/**
 * Everything a capture document has to prove before the driver is allowed to take bytes off it.
 *
 * HTML images, SVG resources and CSS artwork settle the same way for every asset type.
 */
import { redactPublisherResource } from '@shared/asset-publishing/publisher-diagnostics';

export const ASSET_SETTLE_TIMEOUT_MS = 15_000;

/**
 * How long a decoded CSS image may take to reach the screen on its own element.
 * Decoding is already proven by then, so this only bounds raster and presentation;
 * a missing paint past it refuses the capture.
 */
export const ARTWORK_PAINT_TIMEOUT_MS = 5000;

/** Element Timing only reports images on elements that carry this attribute when the image first paints. */
const PAINT_TIMING_ATTRIBUTE = 'elementtiming';
const PAINT_TIMING_IDENTIFIER = 'capture-artwork';
/** Element Timing truncates `data:` URLs to this many characters. */
const PAINT_TIMING_DATA_URL_LENGTH = 100;

/** The Element Timing entry fields this file reads; TypeScript's DOM library does not declare the interface. */
type ElementPaintEntry = PerformanceEntry & { element: Element | null; url: string };

const paintedArtwork = new WeakMap<Element, Set<string>>();
let paintTracking = false;

function imageLabel(image: HTMLImageElement): string {
  const source = image.currentSrc || image.src;
  return source ? redactPublisherResource(source, document.baseURI) : image.alt || '<unknown image>';
}

function svgHref(element: SVGImageElement | SVGUseElement): string | undefined {
  return element.getAttribute('href') ?? element.getAttributeNS('http://www.w3.org/1999/xlink', 'href') ?? undefined;
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new Error('Capture asset settlement was aborted');
}

function decodeImage(image: HTMLImageElement, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  return new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener('abort', onAbort);
      reject(abortReason(signal));
    };
    signal.addEventListener('abort', onAbort, { once: true });
    void image.decode().then(
      () => {
        signal.removeEventListener('abort', onAbort);
        resolve();
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      }
    );
  });
}

async function settleImage(image: HTMLImageElement, signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    throw abortReason(signal);
  }
  if (!image.complete) {
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        image.removeEventListener('load', onLoad);
        image.removeEventListener('error', onError);
        signal.removeEventListener('abort', onAbort);
      };
      const onAbort = () => {
        cleanup();
        reject(abortReason(signal));
      };
      const onError = () => {
        cleanup();
        reject(new Error(`Image failed to load: ${imageLabel(image)}`));
      };
      const onLoad = () => {
        cleanup();
        resolve();
      };
      image.addEventListener('load', onLoad, { once: true });
      image.addEventListener('error', onError, { once: true });
      signal.addEventListener('abort', onAbort, { once: true });
    });
  }
  if (image.naturalWidth === 0) {
    throw new Error(`Image has no decoded pixels: ${imageLabel(image)}`);
  }
  await decodeImage(image, signal);
}

async function settleResourceImage(href: string, signal: AbortSignal, kind: 'SVG' | 'CSS'): Promise<void> {
  if (signal.aborted) {
    throw abortReason(signal);
  }
  const image = new Image();
  image.src = new URL(href, document.baseURI).href;
  const onAbort = () => {
    image.src = '';
  };
  signal.addEventListener('abort', onAbort, { once: true });
  try {
    await decodeImage(image, signal);
    if (signal.aborted) {
      throw abortReason(signal);
    }
    if (image.naturalWidth === 0 || image.naturalHeight === 0) {
      throw new Error(`${kind} image has no decoded pixels: ${redactPublisherResource(href, document.baseURI)}`);
    }
  } catch (error) {
    if (signal.aborted) {
      throw abortReason(signal);
    }
    throw new Error(`${kind} image failed to decode: ${redactPublisherResource(href, document.baseURI)}`, {
      cause: error,
    });
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}

async function settleExternalSvgUse(href: string, signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    throw abortReason(signal);
  }
  const resource = new URL(href, document.baseURI);
  const fragment = resource.hash.slice(1);
  resource.hash = '';
  const response = await fetch(resource, { signal, cache: 'force-cache' });
  const safeResource = redactPublisherResource(href, document.baseURI);
  if (!response.ok) {
    throw new Error(`SVG use returned HTTP ${response.status}: ${safeResource}`);
  }
  const svgText = await response.text();
  const svgDocument = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  if (svgDocument.documentElement.localName !== 'svg' || svgDocument.querySelector('parsererror')) {
    throw new Error(`SVG use returned invalid SVG: ${safeResource}`);
  }
  if (fragment) {
    const decodedFragment = decodeURIComponent(fragment);
    const found = Array.from(svgDocument.querySelectorAll('[id]')).some(
      (element) => element.getAttribute('id') === decodedFragment
    );
    if (!found) {
      throw new Error(`SVG use target is missing: ${safeResource}`);
    }
  }
}

export async function settleSvgResources(signal: AbortSignal): Promise<void> {
  const images = new Set(
    Array.from(document.querySelectorAll<SVGImageElement>('svg image'), svgHref).filter((href): href is string =>
      Boolean(href)
    )
  );
  const uses = new Set(
    Array.from(document.querySelectorAll<SVGUseElement>('svg use'), svgHref).filter((href): href is string =>
      Boolean(href && !href.startsWith('#'))
    )
  );
  await Promise.all([
    ...Array.from(images, (href) => settleResourceImage(href, signal, 'SVG')),
    ...Array.from(uses, (href) => settleExternalSvgUse(href, signal)),
  ]);
}

export async function settleHtmlImages(signal: AbortSignal): Promise<void> {
  /* Large documents can exhaust Chromium decoding capacity when every image decodes at once. */
  for (const image of Array.from(document.images)) {
    await settleImage(image, signal);
  }
}

const CSS_IMAGE_PROPERTIES = ['background-image', 'border-image-source', 'mask-image', 'list-style-image', 'content'];

function renderedStyles(element: Element): CSSStyleDeclaration[] {
  const pseudoStyles = ['::before', '::after']
    .map((pseudo) => getComputedStyle(element, pseudo))
    .filter((style) => style.content !== 'none' && style.content !== 'normal');
  return [getComputedStyle(element), ...pseudoStyles];
}

function cssImageUrls(style: CSSStyleDeclaration): string[] {
  /* Computed styles serialize URL values as double-quoted strings, including inside image-set. */
  const matches = CSS_IMAGE_PROPERTIES.flatMap((property) =>
    Array.from(style.getPropertyValue(property).matchAll(/url\("((?:\\.|[^"\\])*)"\)/gu))
  );
  return matches.map((match) => unescapeCssUrl(match[1])).filter((href) => !href.startsWith('#'));
}

function unescapeCssUrl(value: string): string {
  return value.replace(/\\([0-9a-f]{1,6})\s?|\\(.)/giu, (_escape, hex: string | undefined, character: string) =>
    hex ? String.fromCodePoint(Number.parseInt(hex, 16) || 0xff_fd) : character
  );
}

function captureResources() {
  const styles = Array.from(document.querySelectorAll('*')).flatMap(renderedStyles);
  const cssImages = new Set(styles.flatMap(cssImageUrls));
  return {
    cssImages,
    signature: JSON.stringify([
      Array.from(document.images, (image) => [image.src, image.srcset, image.currentSrc]),
      Array.from(document.querySelectorAll<SVGImageElement | SVGUseElement>('svg image, svg use'), svgHref),
      [...cssImages],
    ]),
  };
}

function paintKey(href: string): string {
  const absolute = new URL(href, document.baseURI).href;
  return absolute.startsWith('data:') ? absolute.slice(0, PAINT_TIMING_DATA_URL_LENGTH) : absolute;
}

function markForPaintTiming(root: Element): void {
  if (!root.hasAttribute(PAINT_TIMING_ATTRIBUTE)) {
    root.setAttribute(PAINT_TIMING_ATTRIBUTE, PAINT_TIMING_IDENTIFIER);
  }
  for (const element of root.querySelectorAll(`:not([${PAINT_TIMING_ATTRIBUTE}])`)) {
    element.setAttribute(PAINT_TIMING_ATTRIBUTE, PAINT_TIMING_IDENTIFIER);
  }
}

/**
 * Records which images each element actually painted, so readiness can prove CSS artwork reached the screen on the element that shows it.
 *
 * Decoding a URL in a separate image only proves that URL decodes now.
 * An element whose own fetch of the same URL failed silently, such as a response that did not decode, keeps painting nothing, and a capture taken then publishes a card without its frame.
 * Call it before the subject renders: Element Timing reports an image only if its element was marked when the image first painted.
 */
export function trackArtworkPaint(): void {
  if (paintTracking) {
    return;
  }
  paintTracking = true;
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries() as ElementPaintEntry[]) {
      if (!entry.element || !entry.url) {
        continue;
      }
      const painted = paintedArtwork.get(entry.element) ?? new Set<string>();
      painted.add(paintKey(entry.url));
      paintedArtwork.set(entry.element, painted);
    }
  }).observe({ type: 'element', buffered: true });
  if (document.documentElement) {
    markForPaintTiming(document.documentElement);
  }
  new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node instanceof Element) {
          markForPaintTiming(node);
        }
      }
    }
  }).observe(document, { childList: true, subtree: true });
}

function backgroundImageUrls(element: Element): string[] {
  const value = getComputedStyle(element).getPropertyValue('background-image');
  /* An image-set paints one of its candidates, so no single URL in it is owed a paint. */
  if (!value.includes('url(') || value.includes('image-set(')) {
    return [];
  }
  return Array.from(value.matchAll(/url\("((?:\\.|[^"\\])*)"\)/gu), (match) => unescapeCssUrl(match[1])).filter(
    (href) => !href.startsWith('#')
  );
}

/** Element Timing only reports what painted inside the viewport, on an element that is not hidden. */
function paintsOnScreen(element: Element): boolean {
  if (!element.checkVisibility({ opacityProperty: true, visibilityProperty: true })) {
    return false;
  }
  const rect = element.getBoundingClientRect();
  const width = Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0);
  const height = Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0);
  return width > 0 && height > 0;
}

/** Background artwork on visible elements whose own paint Element Timing has not reported yet. */
function unpaintedArtwork(): string[] {
  const missing = new Set<string>();
  for (const element of document.querySelectorAll('body *')) {
    const hrefs = backgroundImageUrls(element);
    if (!hrefs.length || !paintsOnScreen(element)) {
      continue;
    }
    const painted = paintedArtwork.get(element);
    for (const href of hrefs) {
      if (!painted?.has(paintKey(href))) {
        missing.add(href);
      }
    }
  }
  return [...missing];
}

/**
 * Waits until every visible element has painted its own background artwork, as Element Timing reports it.
 * The root and body are left out because their backgrounds paint on the canvas, which Element Timing does not attribute to them.
 */
export async function settleArtworkPaint(signal: AbortSignal, timeoutMs = ARTWORK_PAINT_TIMEOUT_MS): Promise<void> {
  if (!paintTracking) {
    throw new Error('Artwork paint tracking must start before the capture subject renders');
  }
  const deadline = performance.now() + timeoutMs;
  while (true) {
    signal.throwIfAborted();
    const missing = unpaintedArtwork();
    if (!missing.length) {
      return;
    }
    if (performance.now() >= deadline) {
      throw new Error(
        `CSS artwork never painted on its element: ${missing
          .map((href) => redactPublisherResource(href, document.baseURI))
          .join(', ')}`
      );
    }
    await afterPaint();
  }
}

/** Load callbacks can add artwork; only a painted document with no new resources is ready. */
export async function settleCaptureAssets(signal: AbortSignal): Promise<void> {
  const decodedCssImages = new Set<string>();
  let resources = captureResources();
  while (true) {
    signal.throwIfAborted();
    await settleHtmlImages(signal);
    await settleSvgResources(signal);
    /* Decode sequentially, like HTML images, to bound Chromium's decoding memory. */
    for (const href of resources.cssImages) {
      if (!decodedCssImages.has(href)) {
        await settleResourceImage(href, signal, 'CSS');
        decodedCssImages.add(href);
      }
    }
    await afterPaint();
    signal.throwIfAborted();
    const painted = captureResources();
    if (painted.signature === resources.signature) {
      await settleArtworkPaint(signal);
      return;
    }
    resources = painted;
  }
}

export function afterPaint(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}
