import { useEffect, useState } from 'react';

import { FactionSheetView } from '@app/components/factions/sheet/FactionSheetView';
import type { FactionInput } from '@game/schema/faction';

import { publisherSnapshotSchema } from '../../shared/asset-publishing/publisher-snapshot';
import { publisherErrorMessage, redactPublisherResource } from './publisher-diagnostics';
import { assertRequiredPublisherFonts } from './publisher-fonts';

const ASSET_SETTLE_TIMEOUT_MS = 15_000;

type CaptureState = 'loading' | 'ready' | 'error';

function imageLabel(image: HTMLImageElement): string {
  const source = image.currentSrc || image.src;
  return source
    ? redactPublisherResource(source, document.baseURI)
    : image.alt || '<unknown image>';
}

function svgHref(element: SVGImageElement | SVGUseElement): string | undefined {
  return (
    element.getAttribute('href') ??
    element.getAttributeNS('http://www.w3.org/1999/xlink', 'href') ??
    undefined
  );
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new Error('Capture asset settlement was aborted');
}

async function settleImage(image: HTMLImageElement, signal: AbortSignal): Promise<void> {
  if (signal.aborted) throw abortReason(signal);
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
  if (signal.aborted) throw abortReason(signal);
  const image = new Image();
  image.src = new URL(href, document.baseURI).href;
  const onAbort = () => {
    image.src = '';
  };
  signal.addEventListener('abort', onAbort, { once: true });
  try {
    await image.decode();
    if (signal.aborted) throw abortReason(signal);
    if (image.naturalWidth === 0 || image.naturalHeight === 0) {
      throw new Error(
        `SVG image has no decoded pixels: ${redactPublisherResource(href, document.baseURI)}`
      );
    }
  } catch (error) {
    if (signal.aborted) throw abortReason(signal);
    throw new Error(
      `SVG image failed to decode: ${redactPublisherResource(href, document.baseURI)}`,
      { cause: error }
    );
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}

async function settleExternalSvgUse(href: string, signal: AbortSignal): Promise<void> {
  if (signal.aborted) throw abortReason(signal);
  const resource = new URL(href, document.baseURI);
  const fragment = resource.hash.slice(1);
  resource.hash = '';
  const response = await fetch(resource, { signal, cache: 'force-cache' });
  const safeResource = redactPublisherResource(href, document.baseURI);
  if (!response.ok) throw new Error(`SVG use returned HTTP ${response.status}: ${safeResource}`);
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
    if (!found) throw new Error(`SVG use target is missing: ${safeResource}`);
  }
}

async function settleSvgResources(signal: AbortSignal): Promise<void> {
  const images = new Set(
    Array.from(document.querySelectorAll<SVGImageElement>('svg image'), svgHref).filter(
      (href): href is string => Boolean(href)
    )
  );
  const uses = new Set(
    Array.from(document.querySelectorAll<SVGUseElement>('svg use'), svgHref).filter(
      (href): href is string => Boolean(href && !href.startsWith('#'))
    )
  );
  await Promise.all([
    ...Array.from(images, (href) => settleSvgImage(href, signal)),
    ...Array.from(uses, (href) => settleExternalSvgUse(href, signal)),
  ]);
}

function afterPaint(): Promise<void> {
  return new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  );
}

export function PublisherFactionSheetCapture() {
  const [state, setState] = useState<CaptureState>('loading');
  const [detail, setDetail] = useState('Loading exact claimed snapshot');
  const [faction, setFaction] = useState<FactionInput>();
  const [payloadHash, setPayloadHash] = useState<string>();

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(
      () => controller.abort(new Error('Timed out loading exact claimed snapshot')),
      ASSET_SETTLE_TIMEOUT_MS
    );
    void (async () => {
      try {
        const response = await fetch('/__asset-publisher/snapshot', {
          cache: 'no-store',
          credentials: 'same-origin',
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Claimed snapshot returned HTTP ${response.status}`);
        const snapshot = publisherSnapshotSchema.parse(await response.json());
        setFaction(snapshot.payload.faction);
        setPayloadHash(snapshot.payloadHash);
        setDetail(`Rendering exact claimed snapshot ${snapshot.payloadHash}`);
      } catch (error) {
        setState('error');
        setDetail(publisherErrorMessage(error));
      } finally {
        window.clearTimeout(timeout);
      }
    })();
    return () => {
      controller.abort(new Error('Capture route unmounted'));
      window.clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    if (!faction) return;
    document.documentElement.dataset.factionSheet = '';
    let disposed = false;
    const controller = new AbortController();
    const timeout = window.setTimeout(
      () => controller.abort(new Error('Timed out waiting for capture assets')),
      ASSET_SETTLE_TIMEOUT_MS
    );
    void (async () => {
      try {
        await afterPaint();
        await document.fonts.ready;
        await assertRequiredPublisherFonts(document.fonts);
        await Promise.all(
          Array.from(document.images, (image) => settleImage(image, controller.signal))
        );
        await settleSvgResources(controller.signal);
        if (!disposed && !controller.signal.aborted) {
          setState('ready');
          setDetail('Exact snapshot, fonts, HTML images, and SVG resources are ready');
        }
      } catch (error) {
        if (!disposed) {
          setState('error');
          setDetail(publisherErrorMessage(error));
        }
      } finally {
        window.clearTimeout(timeout);
      }
    })();
    return () => {
      disposed = true;
      controller.abort(new Error('Capture route unmounted'));
      window.clearTimeout(timeout);
      delete document.documentElement.dataset.factionSheet;
    };
  }, [faction]);

  return (
    <>
      <output
        id="capture-status"
        data-capture-state={state}
        data-payload-hash={payloadHash}
        aria-live="polite"
        hidden
      >
        {detail}
      </output>
      {faction ? <FactionSheetView faction={faction} /> : null}
    </>
  );
}
