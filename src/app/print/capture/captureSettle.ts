/**
 * Everything a capture document has to prove before the driver is allowed to take bytes off it.
 *
 * None of it is per asset type: fonts, HTML images and SVG resources settle the same way whether the subject is a two-page sheet or one card, so the checks live apart from the thing being drawn.
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
  await image.decode();
}

async function settleSvgImage(href: string, signal: AbortSignal): Promise<void> {
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
    await image.decode();
    if (signal.aborted) {
      throw abortReason(signal);
    }
    if (image.naturalWidth === 0 || image.naturalHeight === 0) {
      throw new Error(`SVG image has no decoded pixels: ${redactPublisherResource(href, document.baseURI)}`);
    }
  } catch (error) {
    if (signal.aborted) {
      throw abortReason(signal);
    }
    throw new Error(`SVG image failed to decode: ${redactPublisherResource(href, document.baseURI)}`, { cause: error });
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
    ...Array.from(images, (href) => settleSvgImage(href, signal)),
    ...Array.from(uses, (href) => settleExternalSvgUse(href, signal)),
  ]);
}

export async function settleHtmlImages(signal: AbortSignal): Promise<void> {
  await Promise.all(Array.from(document.images, (image) => settleImage(image, signal)));
}

export function afterPaint(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}
