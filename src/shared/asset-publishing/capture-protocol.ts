/**
 * The one owner of the browser-capture handshake vocabulary (#201). The capture route, the browser
 * driver, the React capture document, and the Chromium regression all consume these values by
 * import; none may hard-code a path, cookie name, marker selector, attribute, or state string
 * locally. Changing any value here is a cross-runtime protocol change: keep it backward-compatible
 * during rollout or deploy all consumers atomically.
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
} as const;

const PAYLOAD_HASH_PATTERN = /^[0-9a-f]{64}$/;

export function isCapturePayloadHash(value: string | null): value is string {
  return value !== null && PAYLOAD_HASH_PATTERN.test(value);
}
