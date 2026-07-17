import {
  publisherErrorMessage,
  serializePublisherLogEvent,
} from '../../src/app/capture/publisher-diagnostics';
import { readBoundedJson, runWithDeadline } from './http';

const CLAIM_HEADER = 'X-Asset-Item-Claim';
const CLAIM_COOKIE = '__Host-asset_item_claim';
const DEADLINE_COOKIE = '__Host-asset_render_deadline';
const MAX_SNAPSHOT_BYTES = 1_000_000;
const SNAPSHOT_DEADLINE_MS = 30_000;

export type CaptureEnv = {
  ASSETS: { fetch(request: Request): Promise<Response> };
  CONVEX_RENDER_URL: string;
};

function noStoreJson(value: unknown, status: number): Response {
  return Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
}

function itemClaimToken(request: Request): string | undefined {
  const header = request.headers.get(CLAIM_HEADER) ?? undefined;
  const cookie = request.headers
    .get('Cookie')
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${CLAIM_COOKIE}=`))
    ?.slice(CLAIM_COOKIE.length + 1);
  const value = header ?? cookie;
  return typeof value === 'string' && value.length >= 16 && value.length <= 256 ? value : undefined;
}

function cookie(request: Request, name: string): string | undefined {
  return request.headers
    .get('Cookie')
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

function snapshotDeadline(request: Request): number {
  const maximum = Date.now() + SNAPSHOT_DEADLINE_MS;
  const value = cookie(request, DEADLINE_COOKIE);
  if (!value || !/^\d+$/.test(value)) return maximum;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? Math.min(maximum, parsed) : maximum;
}

type ItemClaimValidation =
  | { status: 'valid'; body: unknown }
  | { status: 'invalid' }
  | { status: 'unavailable' };

async function validateItemClaim(request: Request, env: CaptureEnv): Promise<ItemClaimValidation> {
  const claimToken = itemClaimToken(request);
  if (!claimToken) return { status: 'invalid' };
  try {
    return await runWithDeadline(snapshotDeadline(request), async (signal) => {
      const upstream = await fetch(env.CONVEX_RENDER_URL, {
        method: 'GET',
        headers: { Authorization: `Bearer ${claimToken}` },
        signal,
      });
      if (!upstream.ok) return { status: 'invalid' as const };
      const body = await readBoundedJson(upstream, MAX_SNAPSHOT_BYTES, signal);
      if (typeof body !== 'object' || body === null || !('ok' in body) || body.ok !== true) {
        return { status: 'invalid' as const };
      }
      return { status: 'valid' as const, body };
    });
  } catch (error) {
    console.error(
      serializePublisherLogEvent({
        event: 'asset_publisher_item_read_error',
        error: publisherErrorMessage(error),
      })
    );
    return { status: 'unavailable' };
  }
}

async function captureDocument(request: Request, env: CaptureEnv): Promise<Response> {
  if (request.method !== 'GET' || (await validateItemClaim(request, env)).status !== 'valid') {
    return noStoreJson({ error: 'Not found' }, 404);
  }
  const assetUrl = new URL('/publisher-capture.html', request.url);
  const asset = await env.ASSETS.fetch(new Request(assetUrl, request));
  const headers = new Headers(asset.headers);
  headers.set('Cache-Control', 'no-store');
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(asset.body, {
    status: asset.status,
    statusText: asset.statusText,
    headers,
  });
}

async function gatedCaptureAsset(request: Request, env: CaptureEnv): Promise<Response> {
  if (request.method !== 'GET' || (await validateItemClaim(request, env)).status !== 'valid') {
    return noStoreJson({ error: 'Not found' }, 404);
  }
  const asset = await env.ASSETS.fetch(request);
  const headers = new Headers(asset.headers);
  headers.set('Cache-Control', 'no-store');
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(asset.body, {
    status: asset.status,
    statusText: asset.statusText,
    headers,
  });
}

async function exactSnapshot(request: Request, env: CaptureEnv): Promise<Response> {
  if (request.method !== 'GET') return noStoreJson({ error: 'Not found' }, 404);
  const validation = await validateItemClaim(request, env);
  if (validation.status === 'invalid') return noStoreJson({ error: 'Not found' }, 404);
  if (validation.status === 'unavailable') {
    return noStoreJson({ error: 'Snapshot unavailable' }, 502);
  }
  return noStoreJson(validation.body, 200);
}

export async function handleCaptureRoute(
  request: Request,
  env: CaptureEnv
): Promise<Response | undefined> {
  const pathname = new URL(request.url).pathname;
  if (pathname === '/__asset-publisher/capture') return await captureDocument(request, env);
  if (pathname === '/__asset-publisher/snapshot') return await exactSnapshot(request, env);
  if (pathname === '/publisher-capture.html' || pathname.startsWith('/publisher-capture/')) {
    return await gatedCaptureAsset(request, env);
  }
  return undefined;
}

export const captureClaimHeader = CLAIM_HEADER;
export const captureClaimCookie = CLAIM_COOKIE;
export const captureDeadlineCookie = DEADLINE_COOKIE;
