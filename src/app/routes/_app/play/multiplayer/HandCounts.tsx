/* @jsxImportSource @app/widgets/tabletop/three-jsx */
import { Html } from '@react-three/drei/webgpu';
import { factionTokenFaceUp } from '@shared/play/factionToken';
import { stormOrder } from '@shared/play/stormSector';
import { cardBaySlotPositions } from '@shared/play/tableFurnitureLayout';
import { useMemo } from 'react';

import { Token as FactionToken } from '@game/assets/faction/token/Token';

import type { TableProjection } from '../../../../db/tabletop/TableSession';
import styles from './HandCounts.module.css';

type Variant = 'a' | 'b' | 'c' | 'd';

/* PROTOTYPE: the look is picked from the page address while Norbert compares them. */
function variant(): Variant {
  const picked = typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('ledger');
  return picked === 'b' || picked === 'c' || picked === 'd' ? picked : 'a';
}

/* The left card bay's empty slot: outer column, bottom row. */
const [, y] = cardBaySlotPositions('left')[0]!;
const SPOT: [number, number, number] = [-6.72, y + 0.03, 1.32];

type Row = {
  id: string;
  name: string;
  count: number;
  out: boolean;
  logo?: NonNullable<TableProjection['snapshot']['factionArtwork']>[string];
};

function Logo({ row }: { row: Row }) {
  return (
    <span className={styles.logo}>
      {row.logo ? <FactionToken logo={row.logo.logo} background={row.logo.background} /> : row.name.slice(0, 2)}
    </span>
  );
}

export function HandCountsScene({ table }: { table: TableProjection }) {
  const roster = table.snapshot.roster;
  const order = useMemo(() => stormOrder(table.state.stormSectorIndex, roster), [table.state.stormSectorIndex, roster]);
  const counts = table.snapshot.handCounts;
  if (!roster || !counts) {
    return null;
  }
  const rows: Row[] = order.map((id) => ({
    id,
    name: table.state.factionNames[id] ?? id,
    count: counts[id] ?? 0,
    out: !factionTokenFaceUp(table.state.pieces, id),
    logo: table.snapshot.factionArtwork?.[id],
  }));
  const look = variant();
  const flat = look !== 'b';
  return (
    <group position={SPOT}>
      <Html
        transform={flat}
        center
        rotation={flat ? [-Math.PI / 2, 0, 0] : undefined}
        scale={flat ? (look === 'c' ? 0.34 : 0.3) : undefined}
        zIndexRange={[4, 0]}
        style={{ pointerEvents: 'none' }}
      >
        <div className={styles[look]} data-hand-counts={look}>
          {look === 'a' && (
            <>
              <div className={styles.title}>Treachery cards</div>
              {rows.map((row) => (
                <div key={row.id} className={styles.row} data-sitting-out={row.out || undefined}>
                  <Logo row={row} />
                  <span className={styles.name}>{row.name}</span>
                  <span className={styles.count}>{row.count}</span>
                </div>
              ))}
            </>
          )}
          {look === 'b' && (
            <>
              <div className={styles.title}>Cards in hand</div>
              {rows.map((row) => (
                <div key={row.id} className={styles.row} data-sitting-out={row.out || undefined}>
                  <Logo row={row} />
                  <span className={styles.name}>{row.name}</span>
                  <span className={styles.count}>{row.count}</span>
                </div>
              ))}
            </>
          )}
          {look === 'c' &&
            rows.map((row) => (
              <div key={row.id} className={styles.cell} data-sitting-out={row.out || undefined} title={row.name}>
                <Logo row={row} />
                <span className={styles.count}>{row.count}</span>
              </div>
            ))}
          {look === 'd' &&
            rows.map((row) => (
              <div key={row.id} className={styles.row} data-sitting-out={row.out || undefined} title={row.name}>
                <Logo row={row} />
                <span className={styles.pips}>
                  {Array.from({ length: row.count }, (_, index) => (
                    <span key={index} className={styles.pip} />
                  ))}
                  {row.count === 0 && <span className={styles.none}>no cards</span>}
                </span>
              </div>
            ))}
        </div>
      </Html>
    </group>
  );
}
