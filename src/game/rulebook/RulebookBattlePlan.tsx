import type { RulebookResolvedSource } from '@shared/rulebooks/sources';
import { rulebookSourceClipPath } from '@shared/rulebooks/sources';

import { useAsset } from '../assets/assetRenderMode';
import './RulebookRenderer.css';

export type BattlePlanTroops = Readonly<{
  label: string;
  count: number;
  strengthEach: number;
  spiceEach: number;
  starred?: boolean;
}>;

export type RulebookBattlePlanProps = Readonly<{
  title: string;
  color: string;
  troopIcon: string;
  troops: readonly BattlePlanTroops[];
  uncommitted: number;
  leader: { source: RulebookResolvedSource; strength: number; killed: boolean };
  weapon: RulebookResolvedSource;
  defense: RulebookResolvedSource;
  bonus?: number;
  resolved?: boolean;
  losses?: number;
}>;

function number(value: number) {
  const whole = Math.floor(value);
  return value % 1 === 0.5 ? `${whole || ''}½` : String(value);
}

function Piece({ source, killed = false }: Readonly<{ source: RulebookResolvedSource; killed?: boolean }>) {
  const url = useAsset(source.status === 'ready' ? source.imageUrl : '');
  return (
    <div className="rulebookBattlePiece" data-killed={killed || undefined}>
      {source.status === 'ready' ? (
        <img src={url} alt={source.name} style={{ clipPath: rulebookSourceClipPath(source) }} />
      ) : (
        <span>{source.status === 'unselected' ? 'None' : 'Image unavailable'}</span>
      )}
      {killed ? <strong className="rulebookBattleDeath">Killed</strong> : null}
    </div>
  );
}

function Troops({
  count,
  icon,
  color,
  starred = false,
}: Readonly<{ count: number; icon: string; color: string; starred?: boolean }>) {
  const url = useAsset(icon);
  return (
    <div className="rulebookBattleTroops" aria-label={`${count} ${starred ? 'starred' : 'ordinary'} troops`}>
      {Array.from({ length: count }, (_, index) => (
        <span className="rulebookBattleTroop" style={{ backgroundColor: color }} key={index} aria-hidden>
          <svg viewBox="0 0 100 100" aria-hidden="true">
            <use href={`${url}#root`} fill="#e3dbb3" stroke="#21170f" strokeWidth="2" />
          </svg>
          {starred ? <b>★</b> : null}
        </span>
      ))}
    </div>
  );
}

/** Callers supply an authored battle example; this renderer shows its pieces, arithmetic and stated losses. */
export function RulebookBattlePlan({
  title,
  color,
  troopIcon,
  troops,
  uncommitted,
  leader,
  weapon,
  defense,
  bonus = 0,
  resolved = false,
  losses,
}: RulebookBattlePlanProps) {
  const dial = troops.reduce((sum, group) => sum + group.count * group.strengthEach, 0);
  const spice = troops.reduce((sum, group) => sum + group.count * group.spiceEach, 0);
  const committed = troops.reduce((sum, group) => sum + group.count, 0);
  const leaderContribution = resolved && leader.killed ? 0 : leader.strength;
  return (
    <section className="rulebookBattlePlan" aria-label={title}>
      <h3>{title}</h3>
      <div className="rulebookBattleCommitment">
        <figure className="rulebookBattleDial">
          <svg viewBox="0 0 160 160" role="img" aria-label={`Battle wheel dial ${number(dial)}: troop strength only`}>
            <circle cx="80" cy="80" r="76" fill="#e6d6a0" stroke="#51432a" strokeWidth="2" />
            <circle cx="80" cy="80" r="54" fill="#fffaee" stroke="#a18a56" />
            <path d="M 80 20 L 75 29 L 85 29 Z" fill="#922c21" transform={`rotate(${(dial / 21) * 360} 80 80)`} />
            {Array.from({ length: 21 }, (_, n) => {
              const angle = (n / 21) * Math.PI * 2 - Math.PI / 2;
              return (
                <text
                  key={n}
                  x={80 + 65 * Math.cos(angle)}
                  y={80 + 65 * Math.sin(angle)}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize="9"
                  fill="#51432a"
                >
                  {n}
                </text>
              );
            })}
            <text x="80" y="68" textAnchor="middle" fontSize="11">
              DIAL
            </text>
            <text x="80" y="102" textAnchor="middle" fontSize="38" fontWeight="bold">
              {number(dial)}
            </text>
          </svg>
          <figcaption>Troop strength only</figcaption>
        </figure>
        <div className="rulebookBattleTroopGroups">
          {troops.map((group, index) => (
            <div key={index}>
              <strong>{group.label}</strong>
              <Troops count={group.count} icon={troopIcon} color={color} starred={group.starred} />
              <p>
                {group.count} × {number(group.strengthEach)} = {number(group.count * group.strengthEach)} strength
              </p>
              <p>{group.count * group.spiceEach} spice committed</p>
            </div>
          ))}
        </div>
      </div>
      {uncommitted ? (
        <div className="rulebookBattleReserve">
          <Troops count={uncommitted} icon={troopIcon} color={color} />
          <span>{uncommitted} in the territory, not committed to the dial</span>
        </div>
      ) : null}
      <div className="rulebookBattleSpice">
        <strong>{spice} spice</strong>
        <span>{committed} troops committed</span>
      </div>
      <div className="rulebookBattleCards">
        <figure>
          <figcaption>Leader</figcaption>
          <Piece source={leader.source} killed={resolved && leader.killed} />
          <p>{leader.source.status === 'ready' ? leader.source.name : 'Leader'}</p>
          <p>
            {resolved
              ? leader.killed
                ? `${leader.strength} → 0 strength`
                : `${leader.strength} strength, survives`
              : `${leader.strength} strength if alive`}
          </p>
        </figure>
        <figure>
          <figcaption>Weapon</figcaption>
          <Piece source={weapon} />
          <p>{weapon.status === 'ready' ? weapon.name : 'No weapon'}</p>
        </figure>
        <figure>
          <figcaption>Defense</figcaption>
          <Piece source={defense} />
          <p>{defense.status === 'ready' ? defense.name : 'No defense'}</p>
        </figure>
      </div>
      <div className="rulebookBattleTotal">
        <span>{resolved ? 'Battle strength' : 'If the leader survives'}</span>
        <strong>
          {number(dial)} + {leaderContribution}
          {bonus ? ` + ${bonus}` : ''} = {number(dial + leaderContribution + bonus)}
        </strong>
      </div>
      {losses !== undefined ? (
        <p className="rulebookBattleLosses">
          {losses} troops to the Tanks. {committed + uncommitted - losses} remain.
        </p>
      ) : null}
    </section>
  );
}
