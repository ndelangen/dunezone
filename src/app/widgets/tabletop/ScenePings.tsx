/* @jsxImportSource ./three-jsx */
import { useFrame, useThree } from '@react-three/fiber/webgpu';
import type { TablePing } from '@shared/play/protocol';
import { useEffect, useRef, useState } from 'react';
import type { Group, Mesh, MeshBasicMaterial, Object3D } from 'three';

import { playPingSound } from './pingSound';
import { useTabletopActions } from './TabletopContext';

/* How long a ping stays on the table: its last ripple and its dot have played out by then. */
const PING_SHOWN_MS = 1700;
/* A table full of players pinging at once shows the newest this many. */
const MOST_PINGS = 24;
/* Each ripple spreads to this radius, in table units, over its run; the next starts a gap later. */
const RIPPLE_RADIUS = 0.55;
const RIPPLE_S = 1.1;
const RIPPLE_GAP_S = 0.2;
const RIPPLES = [0, 1, 2] as const;
/* Lifted off the surface so the rings never flicker into it. */
const LIFT = 0.006;
/* The pale edge each ring sits on, so a dark colour still reads on the dark table and board. */
const EDGE_COLOR = '#fff6e0';
const FLAT: [number, number, number] = [-Math.PI / 2, 0, 0];

type ShownPing = TablePing & { key: number };

function ignoreRaycast() {}

/** Every ping at the table, this page's own included, as ripples lying on the table where it landed, with a sound. */
export function ScenePings() {
  const { subscribePings } = useTabletopActions();
  const [pings, setPings] = useState<ShownPing[]>([]);
  useEffect(() => {
    let next = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const stop = subscribePings((ping) => {
      const key = next++;
      playPingSound();
      setPings((shown) => [...shown.slice(1 - MOST_PINGS), { ...ping, key }]);
      const timer = setTimeout(() => {
        timers.delete(timer);
        setPings((shown) => shown.filter((candidate) => candidate.key !== key));
      }, PING_SHOWN_MS);
      timers.add(timer);
    });
    return () => {
      stop();
      timers.forEach(clearTimeout);
    };
  }, [subscribePings]);
  return (
    <>
      {pings.map((ping) => (
        <PingRipples key={ping.key} ping={ping} />
      ))}
    </>
  );
}

/* A ripple's spread and fade at `t` seconds into its run: it holds its colour for most of the spread, then fades out. */
function rippleAt(t: number) {
  const progress = t / RIPPLE_S;
  if (progress <= 0 || progress >= 1) {
    return null;
  }
  const eased = 1 - (1 - progress) ** 3;
  return { scale: RIPPLE_RADIUS * (0.1 + 0.9 * eased), opacity: progress < 0.6 ? 1 : (1 - progress) / 0.4 };
}

/* The dot at the centre pops in, holds, and fades as the last ripple does. */
function dotOpacityAt(t: number) {
  const progress = (t * 1000) / PING_SHOWN_MS;
  return progress < 0.7 ? 1 : Math.max(0, (1 - progress) / 0.3);
}

function fade(group: Object3D, opacity: number) {
  for (const child of group.children as Mesh[]) {
    (child.material as MeshBasicMaterial).opacity = opacity;
  }
}

function PingRipples({ ping }: { ping: ShownPing }) {
  const invalidate = useThree((state) => state.invalidate);
  const started = useRef<number | null>(null);
  const rings = useRef<(Object3D | null)[]>([]);
  const dot = useRef<Group>(null);
  /* The scene draws on demand, so a new ping asks for the frames that play it. */
  useEffect(() => invalidate(), [invalidate]);
  useFrame(() => {
    const now = performance.now() / 1000;
    started.current ??= now;
    const t = now - started.current;
    RIPPLES.forEach((index) => {
      const ring = rings.current[index];
      const ripple = rippleAt(t - index * RIPPLE_GAP_S);
      if (!ring) {
        return;
      }
      ring.visible = ripple !== null;
      if (ripple) {
        ring.scale.setScalar(ripple.scale);
        fade(ring, ripple.opacity);
      }
    });
    if (dot.current) {
      fade(dot.current, dotOpacityAt(t));
    }
    if (t * 1000 < PING_SHOWN_MS) {
      invalidate();
    }
  });
  const [x, y, z] = ping.position;
  return (
    <group position={[x, y + LIFT, z]} rotation={FLAT}>
      {RIPPLES.map((index) => (
        <group
          key={index}
          visible={false}
          ref={(group) => {
            rings.current[index] = group;
          }}
        >
          <mesh raycast={ignoreRaycast} renderOrder={1}>
            <ringGeometry args={[0.8, 1.06, 64]} />
            <meshBasicMaterial color={EDGE_COLOR} transparent depthWrite={false} toneMapped={false} fog={false} />
          </mesh>
          <mesh raycast={ignoreRaycast} renderOrder={2} position={[0, 0, 0.001]}>
            <ringGeometry args={[0.85, 1, 64]} />
            <meshBasicMaterial color={ping.color} transparent depthWrite={false} toneMapped={false} fog={false} />
          </mesh>
        </group>
      ))}
      <group ref={dot}>
        <mesh raycast={ignoreRaycast} renderOrder={1}>
          <circleGeometry args={[0.075, 32]} />
          <meshBasicMaterial color={EDGE_COLOR} transparent depthWrite={false} toneMapped={false} fog={false} />
        </mesh>
        <mesh raycast={ignoreRaycast} renderOrder={2} position={[0, 0, 0.001]}>
          <circleGeometry args={[0.055, 32]} />
          <meshBasicMaterial color={ping.color} transparent depthWrite={false} toneMapped={false} fog={false} />
        </mesh>
      </group>
    </group>
  );
}
