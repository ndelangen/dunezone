import { describe, expect, it } from 'vite-plus/test';

import { BiddingHub } from './biddingHub';
import type { Member } from './biddingHub';

function table() {
  const members: Member[] = [];
  const inbox = new Map<string, unknown[]>();
  const closed: string[] = [];
  const hub = new BiddingHub(() => members);
  const join = (role: Member['role'], id: string) => {
    const key = `${role}:${id}:${members.length}`;
    inbox.set(key, []);
    const member: Member = {
      role,
      id,
      socket: {
        send: (frame: string) => inbox.get(key)!.push(JSON.parse(frame)),
        close: () => {
          closed.push(key);
          members.splice(members.indexOf(member), 1);
        },
      } as Member['socket'],
    };
    members.push(member);
    hub.joined(member);
    return { member, key, said: (to: string, data: unknown) => hub.message(member, JSON.stringify({ to, data })) };
  };
  const messages = (key: string) =>
    (inbox.get(key) ?? []).filter((frame) => (frame as { type: string }).type === 'message');
  return { hub, join, inbox, messages, closed, members };
}

describe('the bidding table', () => {
  it('passes a phone’s message to the tablet only', () => {
    const t = table();
    const tablet = t.join('tablet', 'tablet-0001');
    const a = t.join('phone', 'phone-aaaa');
    const b = t.join('phone', 'phone-bbbb');
    a.said('tablet', { bid: 3 });
    a.said('phones', { sneaky: true });
    expect(t.messages(tablet.key)).toEqual([{ type: 'message', from: 'phone-aaaa', data: { bid: 3 } }]);
    expect(t.messages(b.key)).toEqual([]);
  });

  it('lets the tablet speak to one phone or all of them', () => {
    const t = table();
    const tablet = t.join('tablet', 'tablet-0001');
    const a = t.join('phone', 'phone-aaaa');
    const b = t.join('phone', 'phone-bbbb');
    tablet.said('phone-bbbb', 'just you');
    tablet.said('phones', 'everyone');
    expect(t.messages(a.key).map((m) => (m as { data: unknown }).data)).toEqual(['everyone']);
    expect(t.messages(b.key).map((m) => (m as { data: unknown }).data)).toEqual(['just you', 'everyone']);
  });

  it('tells everyone who is there, and a new tablet or the same phone takes over', () => {
    const t = table();
    const first = t.join('tablet', 'tablet-0001');
    const phone = t.join('phone', 'phone-aaaa');
    expect(t.inbox.get(phone.key)!.at(-1)).toEqual({ type: 'presence', tablet: true, phones: ['phone-aaaa'] });
    t.join('tablet', 'tablet-0002');
    t.join('phone', 'phone-aaaa');
    expect(t.closed).toEqual([first.key, phone.key]);
    expect(t.members.map((m) => m.id)).toEqual(['tablet-0002', 'phone-aaaa']);
  });

  it('ignores what is not a message for the table', () => {
    const t = table();
    const tablet = t.join('tablet', 'tablet-0001');
    const phone = t.join('phone', 'phone-aaaa');
    t.hub.message(phone.member, 'not json');
    t.hub.message(phone.member, JSON.stringify({ to: 'tablet' }).slice(0, 5));
    t.hub.message(phone.member, 'x'.repeat(20_000));
    expect(t.messages(tablet.key)).toEqual([]);
  });
});
