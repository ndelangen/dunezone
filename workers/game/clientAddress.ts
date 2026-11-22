/* Per-visitor limits protect the public site; the isolated local stack, hosted load runs and tests open every socket from one machine. */
const LIMITED_ORIGIN = 'https://dune.zone';

/**
 * The visitor's address as Cloudflare's edge reported it to the publisher, which hands the request on unchanged.
 * The game Worker has no public route, so the header comes from the publisher's own request: Cloudflare's edge sets it for a visitor, and only another Worker on the dune.zone zone could set it by hand.
 * CF-Connecting-IPv6 is read only when the zone's Pseudo IPv4 setting replaced the address with one from 240.0.0.0/4: otherwise the edge never sets it, and a copy the visitor sent could name any address.
 */
export function clientAddress(request: Request, env: { APPLICATION_ORIGIN: string }) {
  if (env.APPLICATION_ORIGIN !== LIMITED_ORIGIN) {
    return undefined;
  }
  const address = request.headers.get('CF-Connecting-IP');
  if (!address) {
    return undefined;
  }
  const pseudo = /^(\d{1,3})\./u.exec(address);
  const original = pseudo && Number(pseudo[1]) >= 240 ? request.headers.get('CF-Connecting-IPv6') : null;
  return networkOf(original ?? address);
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

/** A short digest of an address, so a socket's saved attachment does not hold the address in plain text; an IPv4 address can still be recovered from it by trying them all. */
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
