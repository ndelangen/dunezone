/* PROTOTYPE (#1142, accepted as variant D): the drafting overlay on the table. Per-player bans and picks beside each avatar, pooled zones at the edges, gates at the top. Throwaway; never merged. */
import { bannedIds, bannersOf, factionById, isBanned, me, pickersOf, pool } from './fixture';
import { Avatar, Chips, FactionToken, GatesReadout, OpenSeat } from './parts';
import type { VariantProps } from './parts';

export function DraftingOverlay({ state, dispatch }: VariantProps) {
  const current = me(state);
  const openSeats = Math.max(0, state.seatCount - state.players.length);
  return (
    <div className="dp-overlay dp-a">
      <section className="dp-a__zone dp-a__zone--banned" aria-label="Banned factions">
        <h3>Banned</h3>
        <ul>
          {bannedIds(state).map((id) => (
            <li key={id}>
              <FactionToken faction={factionById(id)} banned size={2.2} />
              <span className="dp-a__zone-name">{factionById(id).name}</span>
              <Chips players={bannersOf(state, id)} />
            </li>
          ))}
          {bannedIds(state).length === 0 ? <li className="dp-empty">Nobody has banned a faction</li> : null}
        </ul>
      </section>

      <section className="dp-a__ledger" aria-label="Players">
        <GatesReadout state={state} />
        <ol>
          {state.players.map((player) => (
            <li key={player.id} className={player.id === current.id ? 'is-me' : ''}>
              <span className="dp-a__side dp-a__side--bans">
                {player.bans.map((id) => (
                  <FactionToken
                    key={id}
                    faction={factionById(id)}
                    banned
                    size={1.7}
                    onClick={player.id === current.id ? () => dispatch({ type: 'unban', faction: id }) : undefined}
                    title={player.id === current.id ? `Remove your ban on ${factionById(id).name}` : `${player.name} banned ${factionById(id).name}`}
                  />
                ))}
              </span>
              <Avatar player={player} />
              <span className="dp-a__side dp-a__side--picks">
                {player.picks.map((id) => (
                  <FactionToken
                    key={id}
                    faction={factionById(id)}
                    size={1.7}
                    dim={isBanned(state, id)}
                    onClick={player.id === current.id ? () => dispatch({ type: 'unpick', faction: id }) : undefined}
                    title={player.id === current.id ? `Remove ${factionById(id).name} from your draft` : `${player.name} drafted ${factionById(id).name}`}
                  />
                ))}
              </span>
            </li>
          ))}
          {Array.from({ length: openSeats }, (_, index) => (
            <li key={`open-${index}`} className="is-open">
              <span className="dp-a__side" />
              <OpenSeat />
              <span className="dp-a__side" />
            </li>
          ))}
        </ol>
      </section>

      <section className="dp-a__zone dp-a__zone--drafted" aria-label="Drafted factions">
        <h3>Drafted</h3>
        <ul>
          {pool(state).map((id) => (
            <li key={id}>
              <FactionToken faction={factionById(id)} size={2.2} />
              <span className="dp-a__zone-name">{factionById(id).name}</span>
              <Chips players={pickersOf(state, id)} />
            </li>
          ))}
          {pool(state).length === 0 ? <li className="dp-empty">Nobody has drafted a faction</li> : null}
        </ul>
      </section>
    </div>
  );
}

