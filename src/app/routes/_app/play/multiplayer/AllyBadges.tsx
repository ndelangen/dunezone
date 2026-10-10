/* @jsxImportSource @app/widgets/tabletop/three-jsx */
import { alliesOf } from '@shared/play/alliances';
import { factionTokenStackKey } from '@shared/play/factionToken';
import type { TablePiece } from '@shared/play/model';
import { FACTION_TOKEN_SCALE, TABLE_SURFACE_Y, TROOP_LAYER_HEIGHT, TROOP_TOP_RADIUS } from '@shared/play/tableGeometry';
import { useEffect, useState } from 'react';
import { CanvasTexture, SRGBColorSpace, TextureLoader } from 'three';
import type { Texture } from 'three';

import type { TableProjection } from '../../../../db/tabletop/TableSession';
import {
  BOARD_RIM_COLOR,
  BOARD_RIM_METALNESS,
  BOARD_RIM_ROUGHNESS,
} from '../../../../widgets/tabletop/boardRimGeometry';

const TOKEN_RADIUS = TROOP_TOP_RADIUS * FACTION_TOKEN_SCALE;
const CREAM = '#efe3c2';
/* Review switch while the look is chosen: 'base' sets each allied token on a plate in its ally's colour; 'tucked' slides the ally's own token out from under it. */
export const allyStyle: { current: 'base' | 'tucked' } = { current: 'base' };

function ignoreRaycast() {
  // Alliance marks are never an interaction target.
}

function useFaceTexture(href: string | undefined) {
  const [texture, setTexture] = useState<Texture | null>(null);
  useEffect(() => {
    if (!href) {
      return;
    }
    let live = true;
    new TextureLoader().load(href, (loaded) => {
      loaded.colorSpace = SRGBColorSpace;
      if (live) {
        setTexture(loaded);
      }
    });
    return () => {
      live = false;
    };
  }, [href]);
  return texture;
}

/*
 * Every faction token stands on a coin a band wider all round: in its ally's colour with the cream line the tokens carry inside their rim, or, standing alone, plain in the board rim's colour.
 * A token at its seat overhangs the board's rim and rests at the rim's height, so the coin stands on the table and rises to a little under the token, leaving the board's rim in view.
 */
const PLATE_BAND = 0.085;
const MIN_HEIGHT = 0.018;
const DROP = 0.024;
function Plate({ ally, index, base }: { ally: TablePiece | null; index: number; base: number }) {
  const radius = TOKEN_RADIUS + PLATE_BAND * (index + 1);
  const top = Math.max(TABLE_SURFACE_Y + MIN_HEIGHT, base - DROP) - index * 0.003;
  const height = top - TABLE_SURFACE_Y;
  return (
    <group position={[0, TABLE_SURFACE_Y, 0]}>
      <mesh raycast={ignoreRaycast} position={[0, height / 2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[radius, radius + 0.006, height, 96]} />
        {ally ? (
          <meshStandardMaterial color={ally.color} roughness={0.56} metalness={0.1} />
        ) : (
          <meshStandardMaterial
            color={BOARD_RIM_COLOR}
            roughness={BOARD_RIM_ROUGHNESS}
            metalness={BOARD_RIM_METALNESS}
          />
        )}
      </mesh>
      {ally && (
        <mesh raycast={ignoreRaycast} position={[0, height + 0.0008, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[radius - PLATE_BAND * 0.42, radius - PLATE_BAND * 0.3, 96]} />
          <meshStandardMaterial color={CREAM} roughness={0.6} metalness={0.05} />
        </mesh>
      )}
      <Shadow radius={radius - PLATE_BAND} y={height + 0.0016} />
      <Shadow radius={radius} y={0.001} />
    </group>
  );
}

/*
 * A soft shadow under something round of `radius`, fading out just past its edge: the token's on its coin, and the coin's on the table.
 * The table casts no shadow maps, so it is painted.
 */
const SHADOW_SPREAD = 0.08;
const SHADOW_OPACITY = 0.75;
const shadowTextures = new Map<number, CanvasTexture>();
function shadowTexture(solid: number) {
  const key = Math.round(solid * 1000);
  const cached = shadowTextures.get(key);
  if (cached) {
    return cached;
  }
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d')!;
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(0, 0, 0, 1)');
  gradient.addColorStop(solid, 'rgba(0, 0, 0, 0.85)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  const texture = new CanvasTexture(canvas);
  shadowTextures.set(key, texture);
  return texture;
}

function Shadow({ radius, y }: { radius: number; y: number }) {
  const outer = radius + SHADOW_SPREAD;
  return (
    <mesh raycast={ignoreRaycast} position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
      <circleGeometry args={[outer, 96]} />
      <meshBasicMaterial
        map={shadowTexture(radius / outer)}
        transparent
        opacity={SHADOW_OPACITY}
        depthWrite={false}
        color="#000000"
      />
    </mesh>
  );
}

/* The ally's whole token, sunk a little and slid out sideways from under the faction's own, its face turned the same way. */
const TUCK = 0.3;
function Tucked({ ally, index, tangent }: { ally: TablePiece; index: number; tangent: [number, number] }) {
  const texture = useFaceTexture(ally.items[0]?.artwork?.front);
  const side = index % 2 === 0 ? 1 : -1;
  const reach = TUCK * (1 + Math.floor(index / 2) * 0.6) * side;
  const sink = 0.02 + index * 0.004;
  return (
    <group position={[tangent[0] * reach, -sink, tangent[1] * reach]}>
      <mesh raycast={ignoreRaycast} position={[0, TROOP_LAYER_HEIGHT / 2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[TOKEN_RADIUS, TOKEN_RADIUS * 1.03, TROOP_LAYER_HEIGHT, 96]} />
        <meshStandardMaterial color={ally.color} roughness={0.56} metalness={0.1} />
      </mesh>
      <mesh raycast={ignoreRaycast} position={[0, TROOP_LAYER_HEIGHT + 0.0008, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[TOKEN_RADIUS * 0.97, 96]} />
        <meshStandardMaterial
          key={texture?.uuid ?? 'blank'}
          map={texture}
          color={texture ? '#ffffff' : ally.color}
          roughness={0.5}
          metalness={0.08}
        />
      </mesh>
    </group>
  );
}

/** Under every faction's token, a coin in each ally's colour, or in the board rim's colour for a faction standing alone, so each seat shows at a glance who it is allied with. */
export function AllyBadgesScene({ table }: { table: TableProjection }) {
  const alliances = table.snapshot.alliances;
  const token = (factionId: string) =>
    table.state.pieces.find((piece) => piece.stackKey === factionTokenStackKey(factionId));
  const factions = table.snapshot.roster?.seats.flatMap(({ faction }) => (faction ? [faction.id] : [])) ?? [];
  return factions.flatMap((factionId) => {
    const own = token(factionId);
    if (!own) {
      return [];
    }
    const [x, y, z] = own.position;
    const length = Math.hypot(x, z) || 1;
    /* Along the seat's ring, so a tucked token never slides onto the board or into the reserves behind it. */
    const tangent: [number, number] = [-z / length, x / length];
    const allies = alliesOf(alliances, factionId).flatMap((ally) => {
      const piece = token(ally);
      return piece ? [piece] : [];
    });
    if (allyStyle.current === 'tucked') {
      return [
        <group key={factionId} position={[x, y, z]}>
          {allies.map((ally, index) => (
            <group key={ally.id} rotation={[0, own.orientation, 0]}>
              <Tucked ally={ally} index={index} tangent={rotateTangent(tangent, -own.orientation)} />
            </group>
          ))}
        </group>,
      ];
    }
    const plates = allies.length ? allies : [null];
    return [
      <group key={factionId} position={[x, 0, z]}>
        {plates.map((ally, index) => (
          <Plate key={ally?.id ?? 'alone'} ally={ally} index={index} base={y} />
        ))}
      </group>,
    ];
  });
}

/* The tangent in the token's own turned frame, so the slide stays along the ring however the token is turned. */
function rotateTangent([tx, tz]: [number, number], angle: number): [number, number] {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [tx * cos + tz * sin, -tx * sin + tz * cos];
}
