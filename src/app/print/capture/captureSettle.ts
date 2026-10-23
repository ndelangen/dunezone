/**
 * Everything a capture document has to prove before the driver is allowed to take bytes off it.
 *
 * HTML images, SVG resources and CSS artwork settle the same way for every asset type.
 */
import { redactPublisherResource } from '@shared/asset-publishing/publisher-diagnostics';

export const ASSET_SETTLE_TIMEOUT_MS = 15_000;

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
  return matches
    .map((match) =>
      match[1].replace(/\\([0-9a-f]{1,6})\s?|\\(.)/giu, (_escape, hex: string | undefined, character: string) =>
        hex ? String.fromCodePoint(Number.parseInt(hex, 16) || 0xff_fd) : character
      )
    )
    .filter((href) => !href.startsWith('#'));
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
      return;
    }
    resources = painted;
  }
}

export function afterPaint(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}
