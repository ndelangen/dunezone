import { describe, expect, it } from 'vite-plus/test';

import { clientAddress, networkOf } from './clientAddress';

const deployed = { APPLICATION_ORIGIN: 'https://dune.zone' };
const local = { APPLICATION_ORIGIN: 'http://127.0.0.1:8787' };
const from = (address?: string) =>
  new Request('https://dune.zone/__play/homepage/socket', {
    headers: address ? { 'CF-Connecting-IP': address } : {},
  });

describe('a visitor address for per-visitor limits', () => {
  it('keeps an IPv4 address and folds IPv6 addresses into their /64', () => {
    expect(networkOf('203.0.113.7')).toBe('203.0.113.7');
    expect(networkOf('2001:db8:1:2:3:4:5:6')).toBe('2001:db8:1:2::/64');
    expect(networkOf('2001:0DB8:0001:0002::9')).toBe('2001:db8:1:2::/64');
    expect(networkOf('2001:db8::1')).toBe('2001:db8:0:0::/64');
    expect(networkOf('::1')).toBe('0:0:0:0::/64');
    expect(networkOf('2001::1:2:3:192.0.2.1')).toBe(networkOf('2001:0:0:1:2:3:c000:201'));
    expect(networkOf('2001::1:2:3:192.0.2.1')).toBe('2001:0:0:1::/64');
  });

  it('applies only on the public site, to a request that names the address', () => {
    expect(clientAddress(from('2001:db8:1:2::a'), deployed)).toBe(clientAddress(from('2001:db8:1:2::b'), deployed));
    expect(clientAddress(from(), deployed)).toBeUndefined();
    const pseudo = new Request('https://dune.zone/', {
      headers: { 'CF-Connecting-IP': '240.0.0.1', 'CF-Connecting-IPv6': '2001:db8:1:2::a' },
    });
    expect(clientAddress(pseudo, deployed)).toBe('2001:db8:1:2::/64');
    /* Without Pseudo IPv4 the edge never sets CF-Connecting-IPv6, so a copy the visitor sent is ignored. */
    const forged = new Request('https://dune.zone/', {
      headers: { 'CF-Connecting-IP': '203.0.113.7', 'CF-Connecting-IPv6': '2001:db8:9:9::1' },
    });
    expect(clientAddress(forged, deployed)).toBe('203.0.113.7');
    expect(clientAddress(from('203.0.113.7'), local)).toBeUndefined();
  });
});
