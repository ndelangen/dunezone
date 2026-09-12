/* PROTOTYPE (#1145): the drafting panel's shared parts: the important-decision bar for seat requests, the #1010 note, the faction row with its toggles, and the search tools. Throwaway; never merged. */
import { Eyebrow } from '@ui/content/Eyebrow';
import type { CSSProperties, ReactNode } from 'react';

import { draftWarning, factionTag, gates, isBanned, me } from './fixture';
import type { DraftState, Faction, SeatRequest } from './fixture';
import { Attribution, FactionToken, OpenSeat } from './parts';
import type { VariantProps } from './parts';

/* The important-decision bar: a Block. Callers hand it words and one action; it owns the arrangement, modelled on E's seat card. */
export function DecisionBar({
  media,
  eyebrow,
  title,
  context,
  action,
  tone = 'sand',
}: Readonly<{ media: ReactNode; eyebrow: string; title: string; context: string; action: ReactNode; tone?: 'sand' | 'accepted' }>) {
  return (
    <section className={`dp-bar dp-bar--${tone}`} aria-label={eyebrow}>
      <span className="dp-bar__media">{media}</span>
      <span className="dp-bar__copy">
        <Eyebrow tone="inverse">{eyebrow}</Eyebrow>
        <strong>{title}</strong>
        <small>{context}</small>
      </span>
      <span className="dp-bar__action">{action}</span>
    </section>
  );
}

/* The requester's real picture, the same round mark as a player's. */
export function RequestMark({ request, size = 2.4 }: Readonly<{ request: SeatRequest; size?: number }>) {
  const style = { '--avatar-size': `${size}rem` } as CSSProperties;
  return (
    <span className="dp-avatar" style={style} title={`${request.name} asks for a seat`}>
      <img className="dp-avatar__image" src={request.avatar} alt="" />
    </span>
  );
}

/* The seat-request bar for the viewer's role, or nothing when no decision is pending. */
export function SeatBar({ state, dispatch }: VariantProps) {
  const g = gates(state);
  const open = g.seatCount - g.seated;
  if (state.meId === null) {
    if (state.myRequest) {
      return (
        <DecisionBar
          media={<OpenSeat size={2.4} />}
          eyebrow="Seat requested"
          title="Waiting for a player to approve you"
          context="Any seated player can approve. Until then you keep watching, and you can withdraw the request."
          action={
            <button type="button" className="button button--quiet" onClick={() => dispatch({ type: 'withdrawRequest' })}>
              Withdraw
            </button>
          }
        />
      );
    }
    return (
      <DecisionBar
        media={<OpenSeat size={2.4} />}
        eyebrow="You are watching"
        title="Take a seat in this game?"
        context={`${g.seated} of ${g.seatCount} seats are taken. One seated player's approval seats you; until then you watch.`}
        action={
          <button type="button" className="button button--primary" disabled={open === 0} onClick={() => dispatch({ type: 'requestSeat' })}>
            Request a seat
          </button>
        }
      />
    );
  }
  const request = state.requests[0];
  if (!request) {
    return null;
  }
  const more = state.requests.length - 1;
  return (
    <DecisionBar
      tone="accepted"
      media={<RequestMark request={request} />}
      eyebrow="Seat request"
      title={`${request.name} asks for a seat`}
      context={`${open} open ${open === 1 ? 'seat' : 'seats'} left. Your approval seats them and clears everyone's readiness.${more > 0 ? ` ${more} more ${more === 1 ? 'request waits' : 'requests wait'}.` : ''}`}
      action={
        <button type="button" className="button button--primary" disabled={open === 0} onClick={() => dispatch({ type: 'approve', request: request.id })}>
          Approve
        </button>
      }
    />
  );
}

/* The #1010 warnings: non-blocking for a count mismatch, blocking when the pool is too small. */
export function DraftNote({ state }: Readonly<{ state: DraftState }>) {
  const warning = draftWarning(state);
  if (warning.kind === 'none') {
    return null;
  }
  return (
    <p className={`dp-note ${warning.kind === 'short' ? 'dp-note--blocking' : ''}`} role={warning.kind === 'short' ? 'alert' : 'status'}>
      {warning.kind === 'short' ? <strong>Nobody can be dealt yet. </strong> : null}
      {warning.text}
    </p>
  );
}

/* Draft and Ban, with why a faction cannot be drafted carried in the disabled toggle's hover text and beside its name. */
export function DraftBanToggles({ state, dispatch, faction }: VariantProps & { faction: Faction }) {
  const current = me(state);
  if (!current) {
    return null;
  }
  const banned = isBanned(state, faction.id);
  const picked = current.picks.includes(faction.id);
  const mine = current.bans.includes(faction.id);
  const why = banned ? 'Banned; remove every ban on it first' : faction.blocked;
  return (
    <span className="dp-list__actions">
      <button
        type="button"
        aria-pressed={picked}
        disabled={banned || !faction.eligible}
        title={why}
        onClick={() => dispatch({ type: picked ? 'unpick' : 'pick', faction: faction.id })}
      >
        {picked ? 'Drafted ✓' : 'Draft'}
      </button>
      <button type="button" className="is-ban" aria-pressed={mine} onClick={() => dispatch({ type: mine ? 'unban' : 'ban', faction: faction.id })}>
        {mine ? 'Banned ✓' : 'Ban'}
      </button>
    </span>
  );
}

/* One faction as a list row: token, name and tag or blocking reason, attribution, toggles. */
export function FactionRow({ state, dispatch, faction }: VariantProps & { faction: Faction }) {
  const current = me(state);
  const banned = isBanned(state, faction.id);
  const picked = current?.picks.includes(faction.id) ?? false;
  return (
    <li className={`dp-list__row ${banned ? 'is-banned' : ''} ${picked ? 'is-picked' : ''}`}>
      <FactionToken faction={faction} banned={banned} highlighted={picked} size={2.2} />
      <span className="dp-list__name">
        {faction.name}
        <small>{faction.blocked ?? factionTag(faction)}</small>
      </span>
      <Attribution state={state} factionId={faction.id} />
      <DraftBanToggles state={state} dispatch={dispatch} faction={faction} />
    </li>
  );
}

/* The search field and the show-all filter: Mantine's TextInput and Switch in delivery, plain inputs here. */
export function SearchTools({
  query,
  showAll,
  onQuery,
  onShowAll,
  children,
}: Readonly<{ query: string; showAll: boolean; onQuery: (value: string) => void; onShowAll: (value: boolean) => void; children?: ReactNode }>) {
  return (
    <div className="dp-toolbar">
      <input type="search" placeholder="Search factions" value={query} onChange={(event) => onQuery(event.target.value)} aria-label="Search factions" />
      <label className="dp-check">
        <input type="checkbox" checked={showAll} onChange={(event) => onShowAll(event.target.checked)} /> Show all factions
      </label>
      {children}
    </div>
  );
}
