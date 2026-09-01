/**
 * The one owner of the browser-capture handshake vocabulary (#201).
 * The capture route, the browser driver, the React capture document, and the Chromium regression all consume these values by import;
 * none may hard-code a path, cookie name, marker selector, attribute, or state string locally.
 * Changing any value here is a cross-runtime protocol change: keep it backward-compatible during rollout or deploy all consumers atomically.
 */
export const CAPTURE_PROTOCOL = {
  version: 1,
  paths: {
    /** Authenticated Worker route serving the capture document. */
    document: '/__asset-publisher/capture',
    /** Authenticated Worker route serving the validated snapshot envelope. */
    snapshot: '/__asset-publisher/snapshot',
    /** Renderer-owned isolated bundle document (also served gated by the route). */
    bundleDocument: '/publisher-capture.html',
    /** Prefix for the bundle's hashed assets. */
    bundleAssetPrefix: '/publisher-capture/',
  },
  credentials: {
    jobHeader: 'X-Publication-Job',
    jobCookie: '__Host-publication_job',
    deadlineCookie: '__Host-asset_render_deadline',
    rulebookPdfCookie: '__Host-rulebook_pdf_capture',
  },
  query: {
    rulebookPdfBatch: 'rulebook-pdf-batch',
  },
  marker: {
    id: 'capture-status',
    selector: '#capture-status',
    stateAttribute: 'data-capture-state',
    payloadHashAttribute: 'data-payload-hash',
  },
  states: {
    loading: 'loading',
    ready: 'ready',
    failed: 'error',
  },
  pageMarker: {
    attribute: 'data-faction-sheet-page',
    selector: '[data-faction-sheet-page]',
  },
  rulebookPageMarker: {
    attribute: 'data-rulebook-page',
    selector: '[data-rulebook-page]',
  },
  /**
   * The single element an image capture screenshots, drawn at its renderer's intrinsic size.
   * A paged capture has as many pages as the PDF contract names;
   * an image capture has exactly one frame, so the driver asserts the count rather than trusting the page to have rendered one thing.
   */
  frameMarker: {
    attribute: 'data-capture-frame',
    selector: '[data-capture-frame]',
  },
} as const;

const PAYLOAD_HASH_PATTERN = /^[0-9a-f]{64}$/;

export function isCapturePayloadHash(value: string | null): value is string {
  return value !== null && PAYLOAD_HASH_PATTERN.test(value);
}
