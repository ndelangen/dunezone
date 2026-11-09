import { isLocalIsolatedRuntime } from './localRuntime';

/**
 * The visitor's address as Cloudflare's edge reported it to the publisher, which hands the request on unchanged.
 * The game Worker has no public route, so the header comes from the publisher's own request: Cloudflare's edge sets it for a visitor, and only another Worker on the dune.zone zone could set it by hand.
 * Where the zone's Pseudo IPv4 setting rewrites an IPv6 visitor's address, the real one is in CF-Connecting-IPv6.
 * The isolated local stack and the native tests open every socket from one machine, and get no limit per address.
 */
export function clientAddress(request: Request, env: { GIT_SHA: string; APPLICATION_ORIGIN: string }) {
  if (isLocalIsolatedRuntime(env)) {
    return undefined;
  }
  const address = request.headers.get('CF-Connecting-IPv6') ?? request.headers.get('CF-Connecting-IP');
  return address ? networkOf(address) : undefined;
}

/** An IPv4 address as it is; an IPv6 address by its /64 network, since one household or phone is given a whole /64 and can pick any address in it. */
export function networkOf(address: string) {
  if (!address.includes(':')) {
    return address;
  }
  const [head = '', tail] = withHexTail(address.toLowerCase()).split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const groups =
    tail === undefined
      ? left
      : [...left, ...Array<string>(Math.max(0, 8 - left.length - right.length)).fill('0'), ...right];
  return `${groups
    .slice(0, 4)
    .map((group) => group.replace(/^0+(?=.)/u, ''))
    .join(':')}::/64`;
}

/** A short digest of an address, so a socket's saved attachment never holds the address itself. */
export async function clientKey(address: string | undefined) {
  if (!address) {
    return undefined;
  }
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(address));
  return [...new Uint8Array(digest).slice(0, 8)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/* An IPv6 address that ends in dotted IPv4 (`::ffff:192.0.2.1`) has those 32 bits written as two hex groups, so it expands like any other. */
function withHexTail(address: string) {
  const dotted = /(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/u.exec(address);
  if (!dotted) {
    return address;
  }
  const [a, b, c, d] = dotted.slice(1).map(Number) as [number, number, number, number];
  const hex = (high: number, low: number) => ((high << 8) | low).toString(16);
  return `${address.slice(0, dotted.index)}${hex(a, b)}:${hex(c, d)}`;
}
