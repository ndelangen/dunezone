/* PROTOTYPE (#1142, #1145): shared throwaway parts. Faction tokens are the real generated faces, avatars are the real profile pictures, and neither carries an added border. */
import { Token } from '@game/assets/faction/token/Token';
import type { CSSProperties, ReactNode } from 'react';

import { bannersOf, factionById, FACTIONS, gates, gateStatus, pickersOf } from './fixture';
import type { DraftAction, DraftState, Faction, Player } from './fixture';

export type VariantProps = { state: DraftState; dispatch: (action: DraftAction) => void };

/* The real generated token face, clipped to a circle of the given size. A banned token is greyed and slashed; nothing draws a border. */
export function FactionToken({
  faction,
  size = 2.4,
  banned = false,
  dim = false,
  highlighted = false,
  title,
  onClick,
  children,
}: Readonly<{
  faction: Faction;
  size?: number;
  banned?: boolean;
  dim?: boolean;
  highlighted?: boolean;
  title?: string;
  onClick?: () => void;
  children?: ReactNode;
}>) {
  const className = [
    'dp-token',
    banned ? 'dp-token--banned' : '',
    dim ? 'dp-token--dim' : '',
    highlighted ? 'dp-token--highlighted' : '',
    !faction.eligible ? 'dp-token--locked' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const style = { '--token-size': `${size}rem` } as CSSProperties;
  const body = (
    <>
      <span className="dp-token__face" aria-hidden="true">
        <Token logo={faction.logo} background={faction.background} />
      </span>
      {children}
    </>
  );
  return onClick ? (
    <button type="button" className={className} style={style} title={title ?? faction.name} onClick={onClick}>
      {body}
    </button>
  ) : (
    <span className={className} style={style} title={title ?? faction.name}>
      {body}
    </span>
  );
}

/* The real profile picture, round, no border; a ready player carries a small check. */
export function Avatar({ player, size = 2.6, label = false }: Readonly<{ player: Player; size?: number; label?: boolean }>) {
  const style = { '--avatar-size': `${size}rem` } as CSSProperties;
  return (
    <span className={`dp-avatar ${player.ready ? 'dp-avatar--ready' : ''}`} style={style} title={`${player.name}${player.ready ? ', ready' : ''}`}>
      <img className="dp-avatar__image" src={player.avatar} alt="" />
      {player.ready ? (
        <span className="dp-avatar__check" aria-label="ready">
          ✓
        </span>
      ) : null}
      {label ? <span className="dp-avatar__name">{player.name}</span> : null}
    </span>
  );
}

export function OpenSeat({ size = 2.6, label = false }: Readonly<{ size?: number; label?: boolean }>) {
  const style = { '--avatar-size': `${size}rem` } as CSSProperties;
  return (
    <span className="dp-avatar dp-avatar--open" style={style} title="Open seat">
      <span className="dp-avatar__initials">+</span>
      {label ? <span className="dp-avatar__name">Open seat</span> : null}
    </span>
  );
}

/* Anyone with a picture: a player, a swapping seat's player, a seat request. */
export type ChipPerson = Pick<Player, 'id' | 'name' | 'avatar'>;

export function Chips({ players, size = 1.05 }: Readonly<{ players: ChipPerson[]; size?: number }>) {
  if (players.length === 0) {
    return null;
  }
  return (
    <span className="dp-chips">
      {players.map((person) => (
        <img key={person.id} className="dp-chip" style={{ '--avatar-size': `${size}rem` } as CSSProperties} src={person.avatar} alt={person.name} title={person.name} />
      ))}
    </span>
  );
}

export function Attribution({ state, factionId }: Readonly<{ state: DraftState; factionId: string }>) {
  const pickers = pickersOf(state, factionId);
  const banners = bannersOf(state, factionId);
  return (
    <span className="dp-attribution">
      {pickers.length ? (
        <span className="dp-attribution__group">
          <span className="dp-attribution__label">picked</span>
          <Chips players={pickers} />
        </span>
      ) : null}
      {banners.length ? (
        <span className="dp-attribution__group dp-attribution__group--ban">
          <span className="dp-attribution__label">banned</span>
          <Chips players={banners} />
        </span>
      ) : null}
    </span>
  );
}

export function GatesReadout({ state, compact = false }: Readonly<{ state: DraftState; compact?: boolean }>) {
  const g = gates(state);
  return (
    <div className={`dp-gates ${compact ? 'dp-gates--compact' : ''}`} aria-live={compact ? undefined : 'polite'}>
      <span className={`dp-gate ${g.rosterFull ? 'dp-gate--met' : ''}`}>
        Seats <strong>{g.seated}</strong>/{g.seatCount}
      </span>
      <span className={`dp-gate ${g.enoughFactions ? 'dp-gate--met' : ''}`}>
        Pool <strong>{g.poolSize}</strong>/{g.seated}
        {g.poolSize < g.seated && g.fillable > 0 ? <em> +{Math.min(g.fillable, g.seated - g.poolSize)} random</em> : null}
      </span>
      <span className={`dp-gate ${g.allReady ? 'dp-gate--met' : ''}`}>
        Ready <strong>{g.ready}</strong>/{g.seated}
      </span>
      {compact ? null : <span className="dp-gates__status">{gateStatus(g)}</span>}
    </div>
  );
}

/* The drafting statistics as page-header content, in the centre cell where the turn and phase sit during play. */
export function DraftingHeader({ state }: Readonly<{ state: DraftState }>) {
  const g = gates(state);
  return (
    <div className="dp-header" aria-live="polite">
      <div className="dp-header__copy">
        <span>Drafting</span>
        <strong>{gateStatus(g)}</strong>
      </div>
      <GatesReadout state={state} compact />
    </div>
  );
}

export function ReadyButton({ state, dispatch }: VariantProps) {
  const current = state.players.find((player) => player.id === state.meId);
  const ready = current?.ready ?? false;
  return (
    <button
      type="button"
      className={`button ${ready ? 'button--quiet' : 'button--primary'} dp-ready`}
      aria-pressed={ready}
      onClick={() => dispatch({ type: 'toggleReady' })}
    >
      {ready ? 'Ready ✓ (withdraw)' : 'Ready'}
    </button>
  );
}

/* Every real token face at 512px, for the capture that feeds the 3D scene (see README). Dev only, reached by ?variant=tokens. */
export function TokenGallery() {
  return (
    <div className="dp-gallery" aria-label="Token faces for capture">
      {FACTIONS.map((faction) => (
        <div key={faction.id} className="dp-gallery__cell" data-slug={faction.slug} title={faction.name}>
          <Token logo={faction.logo} background={faction.background} />
        </div>
      ))}
    </div>
  );
}

export function factionName(id: string) {
  return factionById(id).name;
}
