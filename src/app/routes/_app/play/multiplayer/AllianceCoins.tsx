/* @jsxImportSource @app/widgets/tabletop/three-jsx */
import { alliesOf } from '@shared/play/alliances';
import { factionTokenStackKey } from '@shared/play/factionToken';
import type { TablePiece } from '@shared/play/model';
import { useMemo } from 'react';
import { Vector3 } from 'three';

import type { TableProjection } from '../../../../db/tabletop/TableSession';
import { AllianceCoin } from '../../../../widgets/tabletop/AllianceCoin';
import { showsAlliances } from './Alliances';
import { OfferArrow } from './SwapScene';

/**
 * Under every faction's token, a coin in each ally's colour, or in the board rim's colour for a faction standing alone, so each seat shows at a glance who it is allied with.
 * While the game is in play, each offer waiting on an answer flows as arrows from the offering token to the other.
 */
export function AllianceCoinsScene({ table }: { table: TableProjection }) {
  if (!showsAlliances(table.snapshot.stage)) {
    return null;
  }
  const alliances = table.snapshot.alliances;
  const token = (factionId: string) =>
    table.state.pieces.find((piece) => piece.stackKey === factionTokenStackKey(factionId));
  const factions = table.snapshot.roster?.seats.flatMap(({ faction }) => (faction ? [faction.id] : [])) ?? [];
  const coins = factions.flatMap((factionId) => {
    const own = token(factionId);
    if (!own) {
      return [];
    }
    const [x, y, z] = own.position;
    const allies = alliesOf(alliances, factionId).flatMap((ally) => {
      const piece = token(ally);
      return piece ? [piece] : [];
    });
    const coins = allies.length ? allies : [null];
    return [
      <group key={factionId} position={[x, 0, z]}>
        {coins.map((ally, index) => (
          <AllianceCoin
            key={ally?.id ?? 'alone'}
            color={ally?.color ?? null}
            index={index}
            count={coins.length}
            base={y}
          />
        ))}
      </group>,
    ];
  });
  /* Offers waiting on an answer flow from the offering faction's token to the other's, as seat offers do during setup. */
  const offers = table.snapshot.stage === 'play' ? (alliances?.offers ?? []) : [];
  return (
    <>
      {coins}
      {offers.map((offer) => {
        const from = token(offer.from);
        const to = token(offer.to);
        return from && to ? <AllianceOfferArrow key={offer.id} from={from} to={to} /> : null;
      })}
    </>
  );
}

function AllianceOfferArrow({ from, to }: Readonly<{ from: TablePiece; to: TablePiece }>) {
  const [ax, ay, az] = from.position;
  const [bx, by, bz] = to.position;
  const a = useMemo(() => new Vector3(ax, ay, az), [ax, ay, az]);
  const b = useMemo(() => new Vector3(bx, by, bz), [bx, by, bz]);
  return <OfferArrow a={a} b={b} color={from.color} />;
}
