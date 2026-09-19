/* @jsxImportSource ../three-jsx */
import { useFrame } from '@react-three/fiber/webgpu';
import type { GameSnapshot } from '@shared/play/protocol';
import { BOARD_RIM_SURFACE_Y } from '@shared/play/tableGeometry';
import { PLAYER_RING_RADIUS, tableSeatAngles } from '@shared/play/tableSettings';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Color, CubicBezierCurve3, SRGBColorSpace, TextureLoader, Vector3 } from 'three';
import type { Group, Texture } from 'three';

import { useMotionAllowed } from '@app/styles/motion';

const UP = new Vector3(0, 1, 0);

function visibleColor(hex: string) {
  const color = new Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  if (hsl.l < 0.35) {
    color.setHSL(hsl.h, Math.max(hsl.s, 0.4), 0.55);
  }
  return color;
}

/** The accepted low rim-to-rim arch keeps offers clear of the faction faces. */
function archBetween(a: Vector3, b: Vector3) {
  const direction = b.clone().sub(a).setY(0).normalize();
  const start = a
    .clone()
    .addScaledVector(direction, 0.5)
    .add(new Vector3(0, 0.11, 0));
  const end = b
    .clone()
    .addScaledVector(direction, -0.5)
    .add(new Vector3(0, 0.11, 0));
  const lift = Math.min(1.15, 0.35 + start.distanceTo(end) * 0.12);
  return new CubicBezierCurve3(
    start,
    start
      .clone()
      .lerp(end, 0.28)
      .add(new Vector3(0, lift, 0)),
    start
      .clone()
      .lerp(end, 0.72)
      .add(new Vector3(0, lift, 0)),
    end
  );
}

function TokenFace({ url, vacant }: { url: string; vacant: boolean }) {
  const [texture, setTexture] = useState<Texture | null>(null);
  useEffect(() => {
    let disposed = false;
    let loaded: Texture | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const load = () =>
      new TextureLoader().load(
        url,
        (image) => {
          if (disposed) {
            image.dispose();
            return;
          }
          image.colorSpace = SRGBColorSpace;
          image.anisotropy = 8;
          loaded = image;
          setTexture(image);
        },
        undefined,
        () => {
          if (!disposed) {
            retry = setTimeout(load, 10_000);
          }
        }
      );
    load();
    return () => {
      disposed = true;
      clearTimeout(retry);
      loaded?.dispose();
    };
  }, [url]);
  return (
    <meshBasicMaterial
      key={texture?.uuid ?? 'placeholder'}
      map={texture}
      color={texture ? '#ffffff' : '#b5a985'}
      toneMapped={false}
      transparent={vacant}
      opacity={vacant ? 0.4 : 1}
    />
  );
}

function OfferArrow({ a, b, color }: { a: Vector3; b: Vector3; color: string }) {
  const curve = useMemo(() => archBetween(a, b), [a, b]);
  const length = useMemo(() => curve.getLength(), [curve]);
  const count = Math.max(3, Math.round(length / 0.55));
  const motion = useMotionAllowed();
  const group = useRef<Group>(null);
  const offset = useRef(0);
  const tint = useMemo(() => visibleColor(color), [color]);
  useFrame((frame, delta) => {
    if (motion) {
      offset.current = (offset.current + (delta * 1.4) / length) % 1;
    }
    group.current?.children.forEach((mesh, index) => {
      const u = (index / count + offset.current) % 1;
      mesh.position.copy(curve.getPointAt(u));
      mesh.quaternion.setFromUnitVectors(UP, curve.getTangentAt(Math.min(u, 0.999)).normalize());
      mesh.scale.setScalar(Math.max(0.01, Math.min(1, u / 0.18, (1 - u) / 0.18)));
    });
    if (motion) {
      frame.invalidate();
    }
  });
  return (
    <group ref={group}>
      {Array.from({ length: count }, (_, index) => (
        <mesh key={index}>
          <coneGeometry args={[0.15, 0.325, 4]} />
          <meshStandardMaterial color={tint} emissive={tint} emissiveIntensity={1.2} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

export function SwapScene({ snapshot }: { snapshot: GameSnapshot }) {
  const roster = snapshot.roster;
  const swapping = snapshot.swapping;
  const angles = useMemo(() => tableSeatAngles(roster?.seatCount ?? 6), [roster?.seatCount]);
  const positions = useMemo(
    () =>
      new Map(
        roster?.seats.map((seat) => [
          seat.id,
          new Vector3(
            Math.cos(angles[seat.position]!) * PLAYER_RING_RADIUS,
            BOARD_RIM_SURFACE_Y,
            Math.sin(angles[seat.position]!) * PLAYER_RING_RADIUS
          ),
        ])
      ),
    [roster, angles]
  );
  if (!roster || !swapping) {
    return null;
  }
  return (
    <group>
      {roster.seats.map((seat) => {
        const vacant = !snapshot.controls?.seats.includes(seat.id);
        const color = seat.faction?.color ?? '#bbbbbb';
        const url = swapping.tokens[seat.id];
        return (
          <group key={seat.id} position={positions.get(seat.id)!}>
            <mesh position={[0, 0.045, 0]}>
              <cylinderGeometry args={[0.42, 0.42, 0.1, 48]} />
              <meshStandardMaterial color={color} transparent={vacant} opacity={vacant ? 0.35 : 1} />
            </mesh>
            <mesh position={[0, 0.101, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 2 - angles[seat.position]!]}>
              <circleGeometry args={[0.42, 64]} />
              <>{url ? <TokenFace url={url} vacant={vacant} /> : <meshBasicMaterial color={color} />}</>
            </mesh>
            {swapping.ready.includes(seat.id) && (
              <mesh position={[0.42, 0.14, -0.36]}>
                <sphereGeometry args={[0.07, 16, 16]} />
                <meshBasicMaterial color="#63b89d" />
              </mesh>
            )}
          </group>
        );
      })}
      {swapping.offers.map((offer) => (
        <OfferArrow
          key={offer.id}
          a={positions.get(offer.origin)!}
          b={positions.get(offer.target)!}
          color={roster.seats.find((seat) => seat.id === offer.origin)?.faction?.color ?? '#ffffff'}
        />
      ))}
    </group>
  );
}
