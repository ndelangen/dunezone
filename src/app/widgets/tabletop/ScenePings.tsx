/* @jsxImportSource ./three-jsx */
import { useFrame, useThree } from '@react-three/fiber/webgpu';
import type { TablePing } from '@shared/play/protocol';
import { useEffect, useRef, useState } from 'react';
import type { Mesh, MeshBasicMaterial } from 'three';

import { playPingSound } from './pingSound';
import { useTabletopActions } from './TabletopContext';

/* A table full of players pinging at once shows the newest this many. */
const MOST_PINGS = 24;
/* The ripple spreads to this radius, in table units, over its run. */
const RIPPLE_RADIUS = 0.3;
const RIPPLE_MS = 1000;
/* How opaque the ripple is while it holds its colour, before it fades. */
const RIPPLE_OPACITY = 0.85;
/* Lifted off the surface so the ring never flickers into it. */
const LIFT = 0.006;
const FLAT: [number, number, number] = [-Math.PI / 2, 0, 0];

type ShownPing = TablePing & { key: number };

function ignoreRaycast() {}

/** Every ping at the table, this page's own included, as one ripple in the pinger's faction colour lying where it landed, with a sound. */
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
      }, RIPPLE_MS);
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
        <PingRipple key={ping.key} ping={ping} />
      ))}
    </>
  );
}

/* The ripple's spread and fade at `ms` into its run: it holds its colour for most of the spread, then fades out. */
function rippleAt(ms: number) {
  const progress = Math.min(Math.max(ms / RIPPLE_MS, 0), 1);
  const eased = 1 - (1 - progress) ** 3;
  const fade = progress < 0.5 ? 1 : (1 - progress) / 0.5;
  return { scale: RIPPLE_RADIUS * (0.15 + 0.85 * eased), opacity: RIPPLE_OPACITY * fade };
}

function PingRipple({ ping }: { ping: ShownPing }) {
  const invalidate = useThree((state) => state.invalidate);
  const started = useRef<number | null>(null);
  const ring = useRef<Mesh>(null);
  /* The scene draws on demand, so a new ping asks for the frames that play it. */
  useEffect(() => invalidate(), [invalidate]);
  useFrame(() => {
    const now = performance.now();
    started.current ??= now;
    const elapsed = now - started.current;
    const ripple = rippleAt(elapsed);
    if (ring.current) {
      ring.current.scale.setScalar(ripple.scale);
      (ring.current.material as MeshBasicMaterial).opacity = ripple.opacity;
    }
    if (elapsed < RIPPLE_MS) {
      invalidate();
    }
  });
  const [x, y, z] = ping.position;
  return (
    <mesh
      ref={ring}
      position={[x, y + LIFT, z]}
      rotation={FLAT}
      scale={RIPPLE_RADIUS * 0.15}
      raycast={ignoreRaycast}
      renderOrder={1}
    >
      <ringGeometry args={[0.9, 1, 64]} />
      <meshBasicMaterial color={ping.color} transparent opacity={0} depthWrite={false} toneMapped={false} fog={false} />
    </mesh>
  );
}
