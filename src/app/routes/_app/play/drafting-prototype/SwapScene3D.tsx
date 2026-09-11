/* @jsxImportSource ../three-jsx */
/* PROTOTYPE (#1144): dealt faction tokens at the seat stations and offer arrows as arches in the table scene. Throwaway. */
import { useFrame } from '@react-three/fiber/webgpu';
import { BOARD_RIM_SURFACE_Y } from '@shared/play/tableGeometry';
import { PLAYER_RING_RADIUS, tableSeatAngles } from '@shared/play/tableSettings';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Color, CubicBezierCurve3, Quaternion, SRGBColorSpace, TextureLoader, TubeGeometry, Vector3 } from 'three';
import type { Texture } from 'three';

import { mySeat, seatFaction } from './swapping';
import type { Offer, SwapState } from './swapping';

export type ArrowStyle = 'tube' | 'chevrons' | 'comet' | 'chevronsOnly';

const UP = new Vector3(0, 1, 0);

function stationPositions(count: number): Vector3[] {
  return tableSeatAngles(count as 4 | 5 | 6).map(
    (angle) => new Vector3(Math.cos(angle) * PLAYER_RING_RADIUS, BOARD_RIM_SURFACE_Y, Math.sin(angle) * PLAYER_RING_RADIUS)
  );
}

/* Tokens are 0.42 wide; arrows leave and land on the rim, never over the face. */
const TOKEN_EDGE = 0.42 + 0.08;
const TOKEN_TOP = 0.11;

function archBetween(a: Vector3, b: Vector3): CubicBezierCurve3 {
  const direction = b.clone().sub(a).setY(0).normalize();
  const start = a.clone().add(direction.clone().multiplyScalar(TOKEN_EDGE)).add(new Vector3(0, TOKEN_TOP, 0));
  const end = b.clone().sub(direction.clone().multiplyScalar(TOKEN_EDGE)).add(new Vector3(0, TOKEN_TOP, 0));
  const distance = start.distanceTo(end);
  const lift = 0.9 + distance * 0.28;
  const c1 = start.clone().lerp(end, 0.28).add(new Vector3(0, lift, 0));
  const c2 = start.clone().lerp(end, 0.72).add(new Vector3(0, lift, 0));
  return new CubicBezierCurve3(start, c1, c2, end);
}

function visibleColour(hex: string): Color {
  /* Dark faction colours vanish against the board; lift them toward white so every arrow reads. */
  const colour = new Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  colour.getHSL(hsl);
  if (hsl.l < 0.35) {
    colour.setHSL(hsl.h, Math.max(hsl.s, 0.4), 0.55);
  }
  return colour;
}

function orient(tangent: Vector3): Quaternion {
  return new Quaternion().setFromUnitVectors(UP, tangent.clone().normalize());
}

/* The faction logo as a transparent image texture, tinted cream, loaded the way the board map is. */
function useLogoTexture(logoUrl: string): Texture | null {
  const [texture, setTexture] = useState<Texture | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const svg = await fetch(logoUrl).then((response) => response.text());
      const tinted = svg.replace('<svg ', '<svg width="512" height="512" fill="#f6efe0" ');
      const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(tinted)}`;
      new TextureLoader().load(dataUrl, (loaded) => {
        if (cancelled) {
          return;
        }
        loaded.colorSpace = SRGBColorSpace;
        loaded.anisotropy = 8;
        setTexture(loaded);
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [logoUrl]);
  return texture;
}

function SeatToken({ colour, logo, isMe, open, ready }: { colour: string; logo: string; isMe: boolean; open: boolean; ready: boolean }) {
  const face = useLogoTexture(logo);
  return (
    <group>
      <mesh position={[0, 0.045, 0]} castShadow>
        <cylinderGeometry args={[0.42, 0.42, 0.1, 48]} />
        <meshStandardMaterial color={colour} roughness={0.55} metalness={0.15} transparent={open} opacity={open ? 0.35 : 1} />
      </mesh>
      <mesh position={[0, 0.101, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.39, 48]} />
        <meshBasicMaterial color={visibleColour(colour)} toneMapped={false} transparent={open} opacity={open ? 0.4 : 1} />
      </mesh>
      {face ? (
        <mesh position={[0, 0.104, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.5, 0.5]} />
          <meshBasicMaterial map={face} transparent toneMapped={false} opacity={open ? 0.4 : 1} depthWrite={false} />
        </mesh>
      ) : null}
      {isMe ? (
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.48, 0.56, 48]} />
          <meshBasicMaterial color="#f8af40" toneMapped={false} />
        </mesh>
      ) : null}
      {ready ? (
        <mesh position={[0.42, 0.14, -0.36]}>
          <sphereGeometry args={[0.07, 16, 16]} />
          <meshBasicMaterial color="#63b89d" toneMapped={false} />
        </mesh>
      ) : null}
    </group>
  );
}

function SeatTokens({ state }: { state: SwapState }) {
  const me = mySeat(state);
  const positions = useMemo(() => stationPositions(state.seats.length), [state.seats.length]);
  return (
    <group>
      {state.seats.map((seat) => {
        const faction = seatFaction(seat);
        const position = positions[seat.index];
        const isMe = seat.index === me.index;
        const open = !seat.player;
        return (
          <group key={seat.index} position={[position.x, position.y, position.z]}>
            <SeatToken colour={faction.colour} logo={faction.logo} isMe={isMe} open={open} ready={seat.player?.ready ?? false} />
          </group>
        );
      })}
    </group>
  );
}

function ArrowTube({ curve, colour, radius }: { curve: CubicBezierCurve3; colour: Color; radius: number }) {
  const geometry = useMemo(() => new TubeGeometry(curve, 64, radius, 12, false), [curve, radius]);
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color={colour} emissive={colour} emissiveIntensity={0.9} roughness={0.35} toneMapped={false} />
    </mesh>
  );
}

function ArrowHead({ curve, colour, size = 1 }: { curve: CubicBezierCurve3; colour: Color; size?: number }) {
  /* The tip sits exactly where the arch meets the target token's rim; the cone extends back along the arch. */
  const height = 0.42 * size;
  const tangent = curve.getTangent(1).normalize();
  const point = curve.getPoint(1).sub(tangent.clone().multiplyScalar(height / 2));
  const quaternion = orient(tangent);
  return (
    <mesh position={[point.x, point.y, point.z]} quaternion={[quaternion.x, quaternion.y, quaternion.z, quaternion.w]}>
      <coneGeometry args={[0.17 * size, height, 20]} />
      <meshStandardMaterial color={colour} emissive={colour} emissiveIntensity={1.1} toneMapped={false} />
    </mesh>
  );
}

function Chevrons({ curve, colour, count, speed, size = 1 }: { curve: CubicBezierCurve3; colour: Color; count: number; speed: number; size?: number }) {
  const [offset, setOffset] = useState(0);
  const offsetRef = useRef(0);
  useFrame((frame, delta) => {
    offsetRef.current = (offsetRef.current + delta * speed) % 1;
    setOffset(offsetRef.current);
    frame.invalidate();
  });
  return (
    <group>
      {Array.from({ length: count }, (_, index) => {
        const t = (index / count + offset) % 1;
        const point = curve.getPoint(t);
        const quaternion = orient(curve.getTangent(Math.min(t, 0.999)));
        const fade = t < 0.06 ? 0.35 : t > 0.86 ? 0 : 1;
        return (
          <mesh key={index} position={[point.x, point.y, point.z]} quaternion={[quaternion.x, quaternion.y, quaternion.z, quaternion.w]}>
            <coneGeometry args={[0.12 * size, 0.26 * size, 4]} />
            <meshStandardMaterial color={colour} emissive={colour} emissiveIntensity={1.2 * fade} transparent opacity={fade} toneMapped={false} />
          </mesh>
        );
      })}
    </group>
  );
}

function Comet({ curve, colour, speed }: { curve: CubicBezierCurve3; colour: Color; speed: number }) {
  const [t, setT] = useState(0);
  const tRef = useRef(0);
  useFrame((frame, delta) => {
    tRef.current = (tRef.current + delta * speed) % 1;
    setT(tRef.current);
    frame.invalidate();
  });
  const trail = [0, 0.05, 0.1, 0.15].map((lag, index) => {
    const tt = Math.max(0, t - lag);
    const point = curve.getPoint(tt);
    return (
      <mesh key={index} position={[point.x, point.y, point.z]}>
        <sphereGeometry args={[0.13 - index * 0.025, 18, 18]} />
        <meshBasicMaterial color={index === 0 ? '#fff6d8' : colour} transparent opacity={1 - index * 0.22} toneMapped={false} />
      </mesh>
    );
  });
  return <group>{trail}</group>;
}

function OfferArrow({ offer, state, style, positions }: { offer: Offer; state: SwapState; style: ArrowStyle; positions: Vector3[] }) {
  const me = mySeat(state);
  const curve = useMemo(() => archBetween(positions[offer.from], positions[offer.to]), [offer.from, offer.to, positions]);
  const colour = useMemo(() => visibleColour(seatFaction(state.seats[offer.from]).colour), [offer.from, state.seats]);
  const mine = offer.to === me.index || offer.from === me.index;
  const weight = mine ? 1.3 : 1;
  switch (style) {
    case 'tube':
      return (
        <group>
          <ArrowTube curve={curve} colour={colour} radius={0.05 * weight} />
          <ArrowHead curve={curve} colour={colour} size={weight} />
          <mesh position={[curve.getPoint(0).x, curve.getPoint(0).y, curve.getPoint(0).z]}>
            <sphereGeometry args={[0.09 * weight, 16, 16]} />
            <meshStandardMaterial color={colour} emissive={colour} emissiveIntensity={0.8} toneMapped={false} />
          </mesh>
        </group>
      );
    case 'chevrons':
      return (
        <group>
          <ArrowTube curve={curve} colour={colour} radius={0.018 * weight} />
          <Chevrons curve={curve} colour={colour} count={9} speed={0.28} />
          <ArrowHead curve={curve} colour={colour} size={0.8 * weight} />
        </group>
      );
    case 'chevronsOnly':
      return (
        <group>
          <Chevrons curve={curve} colour={colour} count={14} speed={0.26} size={1.25 * weight} />
          <ArrowHead curve={curve} colour={colour} size={0.9 * weight} />
        </group>
      );
    case 'comet':
      return (
        <group>
          <ArrowTube curve={curve} colour={colour} radius={0.03 * weight} />
          <Comet curve={curve} colour={colour} speed={0.45} />
          <ArrowHead curve={curve} colour={colour} size={1.25 * weight} />
        </group>
      );
    default:
      return null;
  }
}

export function SwapScene3D({ state, style }: { state: SwapState; style: ArrowStyle }) {
  const positions = useMemo(() => stationPositions(state.seats.length), [state.seats.length]);
  return (
    <group>
      <SeatTokens state={state} />
      {state.offers.map((offer) => (
        <OfferArrow key={`${offer.from}-${offer.to}`} offer={offer} state={state} style={style} positions={positions} />
      ))}
    </group>
  );
}
