/* @jsxImportSource ./three-jsx */
import { Html } from "@react-three/drei/webgpu";
import type { TablePiece } from "@shared/play/model";
import {
  FACTION_TOKEN_SCALE,
  pieceLabelHeight,
  TROOP_TOP_RADIUS,
} from "@shared/play/tableGeometry";

/* The chip sits on the token's rim, toward the token's right as its Seat sees it. */
const RIM = TROOP_TOP_RADIUS * FACTION_TOKEN_SCALE * 0.85;

/** How many Treachery cards a faction holds, beside its faction token, for everyone at the table. */
export function HandCountChip({
  piece,
  count,
  className,
}: {
  piece: TablePiece;
  count: number;
  className: string;
}) {
  const title = `${piece.label.replace(/ token$/, "")} holds ${count} Treachery ${count === 1 ? "card" : "cards"}`;
  return (
    <group position={[RIM, pieceLabelHeight(piece), RIM]}>
      <Html center zIndexRange={[5, 0]} style={{ pointerEvents: "none" }}>
        <span
          className={className}
          data-hand-count={count}
          aria-label={title}
          title={title}
        >
          <svg viewBox="0 0 12 14" width="9" height="11" aria-hidden="true">
            <rect
              x="3.5"
              y="0.75"
              width="7.75"
              height="10.5"
              rx="1.3"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.2"
              opacity="0.55"
            />
            <rect
              x="0.75"
              y="2.75"
              width="7.75"
              height="10.5"
              rx="1.3"
              fill="currentColor"
            />
          </svg>
          {count}
        </span>
      </Html>
    </group>
  );
}
