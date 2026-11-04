/* @jsxImportSource ./three-jsx */
import { useFrame, useThree } from '@react-three/fiber/webgpu';
import type { TablePing } from '@shared/play/protocol';
import { playUiColors } from '@shared/uiPalette';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Vector3 } from 'three';
import type { Camera, Mesh, MeshBasicMaterial } from 'three';

import { ignoreRaycast } from './ignoreRaycast';
import { pingEdgePlacement } from './pingEdgeMarker';
import { playPingSound } from './pingSound';
import styles from './ScenePings.module.css';
import { useTabletopActions } from './TabletopContext';

/* A table full of players pinging at once shows the newest this many. */
const MOST_PINGS = 24;
/* The ripple spreads to this radius, in table units, over its run. */
const RIPPLE_RADIUS = 0.3;
const RIPPLE_MS = 1000;
/* A ping out of view keeps its edge marker this long: a glance away from the edge should not miss it. */
const EDGE_MS = 3000;
/* How far in from each canvas edge the marker sits, in pixels: below the phase chip and camera dial, and high enough above the dock that a downward arrow (30 px from the centre) still clears it. */
const EDGE_INSETS = { top: 96, right: 28, bottom: 94, left: 28 } as const;
/* How opaque the ripple is while it holds its colour, before it fades. */
const RIPPLE_OPACITY = 0.85;
/* Lifted off the surface it lands on; the ring is drawn over whatever stands there anyway, as card wells and cards rise above it. */
const LIFT = 0.006;
const FLAT: [number, number, number] = [-Math.PI / 2, 0, 0];

type ShownPing = TablePing & { key: number };

/**
 * Every ping at the table, this page's own included, as one ripple in the pinger's faction colour lying where it landed, with a sound.
 * A ping out of view also shows on the canvas edge, pulsing, with an arrow towards where it landed (#2672).
 */
export function ScenePings() {
  const { subscribePings } = useTabletopActions();
  const [pings, setPings] = useState<ShownPing[]>([]);
  useEffect(() => {
    let next = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const stop = subscribePings((ping) => {
      const key = next;
      next += 1;
      playPingSound(ping.sound);
      setPings((shown) => [...shown.slice(1 - MOST_PINGS), { ...ping, key }]);
      const timer = setTimeout(() => {
        timers.delete(timer);
        setPings((shown) => shown.filter((candidate) => candidate.key !== key));
      }, EDGE_MS);
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

const inView = new Vector3();
const projected = new Vector3();

function PingRipple({ ping }: { ping: ShownPing }) {
  const invalidate = useThree((state) => state.invalidate);
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  const renderer = useThree((state) => state.renderer);
  const eventTarget = useThree((state) => state.events.connected as Node | undefined);
  const started = useRef<number | null>(null);
  const ring = useRef<Mesh>(null);
  const edge = useRef<EdgeMarker | null>(null);
  /* The scene draws on demand, so a new ping asks for the frames that play it. */
  useEffect(() => invalidate(), [invalidate]);
  /* The edge marker is a page element over the canvas, laid beside the hands; its own animations pulse it and fade it out. */
  useLayoutEffect(() => {
    const container = eventTarget ?? renderer.domElement.parentNode;
    if (!container) {
      return;
    }
    const marker = edgeMarker(ping.color);
    container.appendChild(marker.element);
    edge.current = marker;
    return () => {
      edge.current = null;
      marker.element.remove();
    };
  }, [eventTarget, ping.color, renderer.domElement]);
  useFrame(() => {
    const now = performance.now();
    if (started.current === null) {
      started.current = now;
    }
    const elapsed = now - started.current;
    const ripple = rippleAt(elapsed);
    if (ring.current) {
      ring.current.visible = elapsed < RIPPLE_MS;
      ring.current.scale.setScalar(ripple.scale);
      (ring.current.material as MeshBasicMaterial).opacity = ripple.opacity;
    }
    if (edge.current) {
      placeEdgeMarker(edge.current, ping, camera, size);
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
      renderOrder={10}
    >
      <ringGeometry args={[0.9, 1, 64]} />
      <meshBasicMaterial
        color={ping.color}
        transparent
        opacity={0}
        depthTest={false}
        depthWrite={false}
        toneMapped={false}
        fog={false}
      />
    </mesh>
  );
}

type EdgeMarker = { element: HTMLDivElement; heading: HTMLDivElement };

function edgeMarker(color: string): EdgeMarker {
  const marker = document.createElement('div');
  marker.className = styles.edgeMarker!;
  marker.dataset.pingEdge = '';
  marker.setAttribute('aria-hidden', 'true');
  marker.style.setProperty('--ping-color', color);
  marker.style.setProperty('--ping-chip', playUiColors.pingEdgeChip);
  marker.style.setProperty('--ping-rim', playUiColors.pingEdgeRim);
  marker.style.setProperty('--ping-edge-ms', `${EDGE_MS}ms`);
  const part = (className: string | undefined, parent: HTMLElement = marker) => {
    const element = document.createElement('div');
    element.className = className!;
    parent.appendChild(element);
    return element;
  };
  part(styles.pulse);
  part(styles.pulse);
  const heading = part(styles.heading);
  part(styles.arrow, heading);
  part(styles.dot, part(styles.chip));
  return { element: marker, heading };
}

/* On the edge towards the ping while the view leaves it out; hidden while it shows, where the ripple marks it. */
function placeEdgeMarker(
  { element: marker, heading }: EdgeMarker,
  ping: TablePing,
  camera: Camera,
  size: { width: number; height: number }
) {
  const [x, y, z] = ping.position;
  inView.set(x, y, z).applyMatrix4(camera.matrixWorldInverse);
  projected.set(x, y, z).project(camera);
  const placement = pingEdgePlacement(inView.toArray(), [projected.x, projected.y], size, EDGE_INSETS);
  marker.toggleAttribute('data-shown', placement !== null);
  if (!placement) {
    return;
  }
  marker.style.transform = `translate3d(${placement.x}px,${placement.y}px,0)`;
  heading.style.rotate = `${placement.angle}rad`;
}
