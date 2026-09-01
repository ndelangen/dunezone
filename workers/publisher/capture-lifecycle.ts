import { CAPTURE_PROTOCOL, isCapturePayloadHash } from '../../src/shared/asset-publishing/capture-protocol';
import { PUBLISHER_RENDERER_CONTRACT } from './renderer-contract';

const { pdf: PDF_CONTRACT } = PUBLISHER_RENDERER_CONTRACT;

/**
 * Structural page surface shared by @cloudflare/playwright (production driver) and playwright (Chromium regression), so both runtimes execute the same lifecycle implementation instead of reimplementing marker waits and physical-bounds checks.
 */
type CaptureLocator = {
  waitFor(options?: { state?: 'attached'; timeout?: number }): Promise<unknown>;
  getAttribute(name: string, options?: { timeout?: number }): Promise<string | null>;
  textContent(options?: { timeout?: number }): Promise<string | null>;
  count(): Promise<number>;
  nth(index: number): CaptureLocator;
  boundingBox(options?: { timeout?: number }): Promise<{ x: number; y: number; width: number; height: number } | null>;
};

export type CapturePage = {
  locator(selector: string): CaptureLocator;
  waitForFunction<Arg>(fn: (arg: Arg) => unknown, arg: Arg, options?: { timeout?: number }): Promise<unknown>;
  evaluate<Result>(fn: () => Result): Promise<Result>;
  emulateMedia(options: { media: 'print' }): Promise<unknown>;
};

export type CaptureMarkerResult = {
  state: string | null;
  payloadHash: string | null;
  detail: string;
};

/** Waits until the capture document leaves `loading`, then reads the marker verbatim. */
export async function waitForCaptureMarkerSettled(
  page: CapturePage,
  timeoutFor: () => number | undefined = () => undefined
): Promise<CaptureMarkerResult> {
  const marker = page.locator(CAPTURE_PROTOCOL.marker.selector);
  await marker.waitFor({ state: 'attached', timeout: timeoutFor() });
  await page.waitForFunction(
    (probe) => {
      const browserGlobal = globalThis as typeof globalThis & {
        document: {
          querySelector(selector: string): { getAttribute(name: string): string | null } | null;
        };
      };
      return browserGlobal.document.querySelector(probe.selector)?.getAttribute(probe.attribute) !== probe.loading;
    },
    {
      selector: CAPTURE_PROTOCOL.marker.selector,
      attribute: CAPTURE_PROTOCOL.marker.stateAttribute,
      loading: CAPTURE_PROTOCOL.states.loading,
    },
    { timeout: timeoutFor() }
  );
  return {
    state: await marker.getAttribute(CAPTURE_PROTOCOL.marker.stateAttribute),
    payloadHash: await marker.getAttribute(CAPTURE_PROTOCOL.marker.payloadHashAttribute),
    detail: (await marker.textContent()) ?? '',
  };
}

/** Grants rendering authority: only a ready marker with an exact payload hash may be captured. */
export function assertReadyCaptureMarker(result: CaptureMarkerResult): string {
  if (result.state !== CAPTURE_PROTOCOL.states.ready) {
    throw new Error(`Capture route reported ${result.state}: ${result.detail}`);
  }
  if (!isCapturePayloadHash(result.payloadHash)) {
    throw new Error('Capture route did not expose the exact payload hash');
  }
  return result.payloadHash;
}

/**
 * Zero body margins, which both capture shapes need for the same reason: a margin offsets the subject away from the document origin, and neither a print page nor a viewport screenshot has anywhere to put that offset.
 */
async function assertZeroBodyMargins(page: CapturePage): Promise<void> {
  const margins = await page.evaluate(() => {
    const browserGlobal = globalThis as typeof globalThis & {
      document: { body: unknown };
      getComputedStyle(element: unknown): {
        marginTop: string;
        marginRight: string;
        marginBottom: string;
        marginLeft: string;
      };
    };
    const style = browserGlobal.getComputedStyle(browserGlobal.document.body);
    return [style.marginTop, style.marginRight, style.marginBottom, style.marginLeft];
  });
  if (margins.some((margin) => margin !== '0px')) {
    throw new Error(`Capture document body margins are not zero: ${margins.join(' ')}`);
  }
}

/**
 * The single-frame contract for an image capture: exactly one frame, at the document origin, at exactly the size the driver sized its viewport to.
 *
 * Screen media, deliberately.
 * A screenshot is not a print, and emulating print here would apply page rules the card renderer never asked for.
 */
export async function assertCaptureImageBounds(
  page: CapturePage,
  geometry: { widthPx: number; heightPx: number },
  timeoutFor: () => number | undefined = () => undefined
): Promise<void> {
  await assertZeroBodyMargins(page);
  const frames = page.locator(CAPTURE_PROTOCOL.frameMarker.selector);
  const count = await frames.count();
  if (count !== 1) {
    throw new Error(`Capture route rendered ${count} capture frames, expected exactly one`);
  }
  const bounds = await frames.nth(0).boundingBox({ timeout: timeoutFor() });
  if (
    !bounds ||
    Math.abs(bounds.x) > 0.5 ||
    Math.abs(bounds.y) > 0.5 ||
    Math.abs(bounds.width - geometry.widthPx) > 0.5 ||
    Math.abs(bounds.height - geometry.heightPx) > 0.5
  ) {
    throw new Error(`Capture frame has invalid physical bounds, expected ${geometry.widthPx}x${geometry.heightPx}`);
  }
}

/**
 * The physical page contract: zero body margins and every sheet page exactly at its print position and size.
 * Shared verbatim by the production driver and the Chromium regression so the two cannot drift apart.
 */
export async function assertCapturePhysicalBounds(
  page: CapturePage,
  timeoutFor: () => number | undefined = () => undefined
): Promise<void> {
  await assertPdfPageBounds(page, CAPTURE_PROTOCOL.pageMarker.selector, PDF_CONTRACT.pageCount, timeoutFor);
}

async function assertPdfPageBounds(
  page: CapturePage,
  selector: string,
  pageCount: number,
  timeoutFor: () => number | undefined
) {
  await page.emulateMedia({ media: 'print' });
  await assertZeroBodyMargins(page);
  const width = (PDF_CONTRACT.pageWidthMm * 96) / 25.4;
  const height = (PDF_CONTRACT.pageHeightMm * 96) / 25.4;
  const pages = page.locator(selector);
  if ((await pages.count()) !== pageCount) {
    throw new Error(`Capture route did not render exactly ${pageCount} pages`);
  }
  for (let index = 0; index < pageCount; index += 1) {
    const bounds = await pages.nth(index).boundingBox({ timeout: timeoutFor() });
    if (
      !bounds ||
      Math.abs(bounds.x) > 0.5 ||
      Math.abs(bounds.y - index * height) > 0.5 ||
      Math.abs(bounds.width - width) > 0.5 ||
      Math.abs(bounds.height - height) > 0.5
    ) {
      throw new Error(
        `Capture page ${index + 1} has bounds ${JSON.stringify(bounds)}, expected x 0, y ${(index * height).toFixed(2)}, width ${width.toFixed(2)}, height ${height.toFixed(2)}`
      );
    }
  }
}

/** Checks one bounded Rulebook batch against the same A4 print geometry used by final composition. */
export async function assertRulebookPdfBatchBounds(
  page: CapturePage,
  pageCount: number,
  timeoutFor: () => number | undefined = () => undefined
) {
  if (!Number.isSafeInteger(pageCount) || pageCount < 1) {
    throw new Error('Rulebook PDF batch Page count must be a positive integer');
  }
  await assertPdfPageBounds(page, CAPTURE_PROTOCOL.rulebookPageMarker.selector, pageCount, timeoutFor);
}
