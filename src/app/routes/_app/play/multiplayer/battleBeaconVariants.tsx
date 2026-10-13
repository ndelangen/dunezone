/* @jsxImportSource @app/widgets/tabletop/three-jsx */
import { useFrame } from '@react-three/fiber/webgpu';
import type { RefObject } from 'react';
import { useEffect, useMemo, useRef } from 'react';
import type { Group, Mesh, MeshBasicMaterial } from 'three';
import { AdditiveBlending, DoubleSide, NormalBlending, Shape, ShapeGeometry } from 'three';

import { ignoreRaycast } from '../../../../widgets/tabletop/ignoreRaycast';

/** What the beacon is doing, read every frame by the variant that draws it. */
export type BeaconPose = {
  /* 0 while it hovers, 1 once it lies flat on the territory it marks. */
  flat: number;
  /* How high the beacon's body floats above the ground point under it. */
  height: number;
  carried: boolean;
};
export type BeaconVariantProps = { pose: RefObject<BeaconPose> };

export const BEACON_GLOW = '#e8261a';
const BEACON_HOT = '#ffb199';
const BEACON_BODY = '#3b4048';

const lerp = (from: number, to: number, amount: number) => from + (to - from) * amount;
/* A slow heartbeat: 0..1, about once a second. */
const pulseAt = (time: number, rate = 1.1) => 0.5 + 0.5 * Math.sin(time * Math.PI * 2 * rate);

/* Light in the air adds to what is behind it; marks on the ground are painted, so they stay red on bright sand. */
function Glow({
  opacity = 1,
  color = BEACON_GLOW,
  additive = false,
  materialRef,
}: Readonly<{
  opacity?: number;
  color?: string;
  additive?: boolean;
  materialRef?: RefObject<MeshBasicMaterial | null>;
}>) {
  return (
    <meshBasicMaterial
      ref={materialRef}
      color={color}
      transparent
      opacity={opacity}
      blending={additive ? AdditiveBlending : NormalBlending}
      depthWrite={false}
      side={DoubleSide}
      toneMapped={false}
      fog={false}
    />
  );
}

function Body({ metalness = 0.7 }: Readonly<{ metalness?: number }>) {
  return (
    <meshStandardMaterial
      color={BEACON_BODY}
      metalness={metalness}
      roughness={0.35}
      emissive={BEACON_GLOW}
      emissiveIntensity={0.08}
    />
  );
}

/** Four L-shaped corner brackets around a square of the given half size, as a targeting lock draws them. */
function useBracketGeometry(half: number, arm: number, thickness: number) {
  const geometry = useMemo(() => {
    const shapes = [0, 1, 2, 3].map((corner) => {
      const sx = corner % 2 ? -1 : 1;
      const sz = corner < 2 ? 1 : -1;
      const shape = new Shape();
      shape.moveTo(sx * half, sz * half);
      shape.lineTo(sx * (half - arm), sz * half);
      shape.lineTo(sx * (half - arm), sz * (half - thickness));
      shape.lineTo(sx * (half - thickness), sz * (half - thickness));
      shape.lineTo(sx * (half - thickness), sz * (half - arm));
      shape.lineTo(sx * half, sz * (half - arm));
      shape.closePath();
      return shape;
    });
    const result = new ShapeGeometry(shapes);
    result.rotateX(-Math.PI / 2);
    return result;
  }, [half, arm, thickness]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return geometry;
}

/** A crosshair of four short bars with a gap in the middle, lying flat on the ground. */
function Crosshair({
  inner,
  outer,
  width,
  opacity = 0.9,
}: Readonly<{ inner: number; outer: number; width: number; opacity?: number }>) {
  const length = outer - inner;
  const middle = (inner + outer) / 2;
  return (
    <group>
      {[0, 1, 2, 3].map((index) => (
        <mesh
          key={index}
          raycast={ignoreRaycast}
          rotation={[-Math.PI / 2, 0, (index * Math.PI) / 2]}
          position={[
            Math.cos((index * Math.PI) / 2) * middle,
            0,
            -Math.sin((index * Math.PI) / 2) * middle,
          ]}
        >
          <planeGeometry args={[length, width]} />
          <Glow opacity={opacity} />
        </mesh>
      ))}
    </group>
  );
}

function FlatRing({
  inner,
  outer,
  opacity = 1,
  segments = 64,
  materialRef,
}: Readonly<{
  inner: number;
  outer: number;
  opacity?: number;
  segments?: number;
  materialRef?: RefObject<MeshBasicMaterial | null>;
}>) {
  return (
    <mesh raycast={ignoreRaycast} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[inner, outer, segments]} />
      <Glow opacity={opacity} materialRef={materialRef} />
    </mesh>
  );
}

/** A thin vertical beam of light from the body down to the ground, fading as the beacon lands. */
function Beam({
  pose,
  radius,
  opacity,
}: Readonly<{ pose: RefObject<BeaconPose>; radius: number; opacity: number }>) {
  const mesh = useRef<Mesh>(null);
  const material = useRef<MeshBasicMaterial>(null);
  useFrame(() => {
    const { flat, height } = pose.current;
    const length = Math.max(0.001, height * (1 - flat));
    mesh.current!.scale.set(1, length, 1);
    mesh.current!.position.y = length / 2;
    material.current!.opacity = opacity * (1 - flat) * (0.6 + 0.4 * pulseAt(performance.now() / 1000, 2.2));
  });
  return (
    <mesh ref={mesh} raycast={ignoreRaycast}>
      <cylinderGeometry args={[radius, radius, 1, 12, 1, true]} />
      <Glow materialRef={material} additive />
    </mesh>
  );
}

/**
 * A: Orbital lance.
 * A tall dark spike with two glowing rings orbiting it, a beam to the ground and a rotating crosshair reticle.
 * Landing folds the spike into a flat diamond and lays the rings down around it.
 */
export function LanceBeacon({ pose }: BeaconVariantProps) {
  const body = useRef<Group>(null);
  const ringA = useRef<Group>(null);
  const ringB = useRef<Group>(null);
  const reticle = useRef<Group>(null);
  const core = useRef<MeshBasicMaterial>(null);
  useFrame(() => {
    const time = performance.now() / 1000;
    const { flat, height } = pose.current;
    const pulse = pulseAt(time);
    body.current!.position.y = lerp(height + 0.04 * Math.sin(time * 1.7), 0.03, flat);
    body.current!.scale.set(lerp(1, 1.5, flat), lerp(1, 0.08, flat), lerp(1, 1.5, flat));
    body.current!.rotation.y = time * 0.6 * (1 - flat);
    for (const [ring, speed, tilt] of [
      [ringA.current!, 1.3, 0.5],
      [ringB.current!, -0.9, -0.7],
    ] as const) {
      ring.position.y = lerp(height, 0.02, flat);
      ring.rotation.set(tilt * (1 - flat), time * speed * (1 - flat), 0);
      const size = lerp(1, speed > 0 ? 1.15 : 1.45, flat);
      ring.scale.setScalar(size);
    }
    reticle.current!.rotation.y = time * 0.5 * (1 - flat);
    reticle.current!.scale.setScalar(lerp(1 + 0.08 * pulse, 0.85, flat));
    core.current!.opacity = 0.55 + 0.45 * pulse;
  });
  return (
    <group>
      <group ref={body}>
        <mesh castShadow raycast={ignoreRaycast} position={[0, 0.17, 0]}>
          <coneGeometry args={[0.13, 0.34, 4]} />
          <Body />
        </mesh>
        <mesh castShadow raycast={ignoreRaycast} position={[0, -0.17, 0]} rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[0.13, 0.34, 4]} />
          <Body />
        </mesh>
        <mesh raycast={ignoreRaycast} scale={[1, 1.8, 1]}>
          <octahedronGeometry args={[0.07]} />
          <Glow materialRef={core} color={BEACON_HOT} />
        </mesh>
      </group>
      <group ref={ringA}>
        <mesh raycast={ignoreRaycast} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.24, 0.008, 6, 64]} />
          <Glow />
        </mesh>
      </group>
      <group ref={ringB}>
        <mesh raycast={ignoreRaycast} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.3, 0.006, 6, 64]} />
          <Glow opacity={0.7} />
        </mesh>
      </group>
      <Beam pose={pose} radius={0.012} opacity={0.8} />
      <group ref={reticle} position={[0, 0.006, 0]}>
        <FlatRing inner={0.3} outer={0.32} opacity={0.85} />
        <Crosshair inner={0.12} outer={0.42} width={0.02} />
      </group>
    </group>
  );
}

/**
 * B: Laser designator.
 * A dark inverted pyramid with a hot core, a laser down to the ground, and lock-on brackets that keep tightening.
 * Landing presses the pyramid into a flat triangle with the brackets locked tight around it.
 */
export function DesignatorBeacon({ pose }: BeaconVariantProps) {
  const body = useRef<Group>(null);
  const brackets = useRef<Group>(null);
  const dot = useRef<Group>(null);
  const core = useRef<MeshBasicMaterial>(null);
  const bracketGeometry = useBracketGeometry(0.3, 0.12, 0.022);
  useFrame(() => {
    const time = performance.now() / 1000;
    const { flat, height } = pose.current;
    /* The lock sweeps in from wide to tight, over and over, until the beacon lands and it stays locked. */
    const sweep = (time * 0.8) % 1;
    const eased = 1 - (1 - sweep) ** 3;
    body.current!.position.y = lerp(height + 0.03 * Math.sin(time * 1.5), 0.025, flat);
    body.current!.scale.set(lerp(1, 1.4, flat), lerp(1, 0.1, flat), lerp(1, 1.4, flat));
    body.current!.rotation.y = time * 0.35 * (1 - flat);
    brackets.current!.scale.setScalar(lerp(lerp(1.7, 1, eased), 1, flat));
    brackets.current!.rotation.y = lerp(Math.PI / 4, 0, lerp(eased, 1, flat));
    dot.current!.scale.setScalar(lerp(0.7 + 0.5 * pulseAt(time, 2), 1, flat));
    core.current!.opacity = 0.5 + 0.5 * pulseAt(time, 1.6);
  });
  return (
    <group>
      <group ref={body}>
        <mesh castShadow raycast={ignoreRaycast} position={[0, 0.03, 0]} rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[0.22, 0.36, 3]} />
          <Body metalness={0.5} />
        </mesh>
        <mesh raycast={ignoreRaycast} position={[0, 0.215, 0]}>
          <sphereGeometry args={[0.055, 20, 12]} />
          <Glow materialRef={core} color={BEACON_HOT} />
        </mesh>
        <mesh raycast={ignoreRaycast} position={[0, 0.215, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.08, 0.1, 3, 1, Math.PI / 2]} />
          <Glow opacity={0.9} />
        </mesh>
      </group>
      <Beam pose={pose} radius={0.006} opacity={1} />
      <group position={[0, 0.006, 0]}>
        <group ref={brackets}>
          <mesh raycast={ignoreRaycast} geometry={bracketGeometry}>
            <Glow opacity={0.95} />
          </mesh>
        </group>
        <group ref={dot}>
          <mesh raycast={ignoreRaycast} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.035, 24]} />
            <Glow color={BEACON_HOT} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

const RIPPLES = 3;
/**
 * C: Holo pylon.
 * A hovering hex puck projects a hexagonal column of light, with scan lines climbing it and sonar ripples on the ground.
 * Landing collapses the column into the puck, which settles flat while the ripples keep spreading, smaller.
 */
export function PylonBeacon({ pose }: BeaconVariantProps) {
  const puck = useRef<Group>(null);
  const column = useRef<Mesh>(null);
  const columnMaterial = useRef<MeshBasicMaterial>(null);
  const scans = useRef<(Group | null)[]>([]);
  const ripples = useRef<(Group | null)[]>([]);
  const rippleMaterials = useRef<RefObject<MeshBasicMaterial | null>[]>(
    Array.from({ length: RIPPLES }, () => ({ current: null }))
  );
  useFrame(() => {
    const time = performance.now() / 1000;
    const { flat, height } = pose.current;
    const top = Math.max(0.001, height * (1 - flat));
    puck.current!.position.y = lerp(height + 0.03 * Math.sin(time * 1.4), 0.02, flat);
    puck.current!.rotation.y = time * 0.4 * (1 - flat);
    puck.current!.scale.set(lerp(1, 1.25, flat), lerp(1, 0.35, flat), lerp(1, 1.25, flat));
    column.current!.scale.set(1, top, 1);
    column.current!.position.y = top / 2;
    columnMaterial.current!.opacity = (1 - flat) * (0.14 + 0.06 * pulseAt(time, 1.4));
    scans.current.forEach((scan, index) => {
      const climb = (time * 0.45 + index / 3) % 1;
      scan!.position.y = climb * top;
      scan!.scale.setScalar(1 - flat);
    });
    ripples.current.forEach((ripple, index) => {
      const spread = (time * 0.55 + index / RIPPLES) % 1;
      ripple!.scale.setScalar(lerp(0.4 + spread * 1.1, 0.5 + spread * 0.6, flat));
      rippleMaterials.current[index]!.current!.opacity = (1 - spread) * 0.8;
    });
  });
  return (
    <group>
      <group ref={puck}>
        <mesh castShadow raycast={ignoreRaycast} rotation={[0, Math.PI / 6, 0]}>
          <cylinderGeometry args={[0.2, 0.22, 0.08, 6]} />
          <Body />
        </mesh>
        <mesh raycast={ignoreRaycast} position={[0, -0.042, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 6]}>
          <ringGeometry args={[0.1, 0.16, 6]} />
          <Glow />
        </mesh>
        <mesh raycast={ignoreRaycast} position={[0, 0.042, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 6]}>
          <circleGeometry args={[0.07, 6]} />
          <Glow color={BEACON_HOT} />
        </mesh>
      </group>
      <mesh ref={column} raycast={ignoreRaycast} rotation={[0, Math.PI / 6, 0]}>
        <cylinderGeometry args={[0.18, 0.24, 1, 6, 1, true]} />
        <Glow materialRef={columnMaterial} additive />
      </mesh>
      {[0, 1, 2].map((index) => (
        <group
          key={index}
          ref={(group) => {
            scans.current[index] = group;
          }}
        >
          <mesh raycast={ignoreRaycast} rotation={[-Math.PI / 2, 0, Math.PI / 6]}>
            <ringGeometry args={[0.2, 0.215, 6]} />
            <Glow opacity={0.7} />
          </mesh>
        </group>
      ))}
      <group position={[0, 0.006, 0]}>
        {Array.from({ length: RIPPLES }, (_, index) => (
          <group
            key={index}
            ref={(group) => {
              ripples.current[index] = group;
            }}
          >
            <FlatRing
              inner={0.27}
              outer={0.29}
              segments={6}
              materialRef={rippleMaterials.current[index]}
            />
          </group>
        ))}
      </group>
    </group>
  );
}

/**
 * D: Uplink drone.
 * A compact saucer with three fins throws a cone of light onto the ground, where it draws a target with a crosshair.
 * Landing folds the fins in and sets the saucer down flat in the middle of its own target.
 */
export function DroneBeacon({ pose }: BeaconVariantProps) {
  const body = useRef<Group>(null);
  const fins = useRef<(Group | null)[]>([]);
  const cone = useRef<Mesh>(null);
  const coneMaterial = useRef<MeshBasicMaterial>(null);
  const target = useRef<Group>(null);
  const eye = useRef<MeshBasicMaterial>(null);
  useFrame(() => {
    const time = performance.now() / 1000;
    const { flat, height } = pose.current;
    const drop = Math.max(0.001, height * (1 - flat));
    body.current!.position.y = lerp(height + 0.035 * Math.sin(time * 1.9), 0.03, flat);
    body.current!.rotation.y = time * 0.8 * (1 - flat);
    body.current!.scale.set(lerp(1, 1.1, flat), lerp(1, 0.45, flat), lerp(1, 1.1, flat));
    fins.current.forEach((fin) => {
      fin!.rotation.z = lerp(0.5, 0, flat);
    });
    cone.current!.scale.set(1, drop, 1);
    cone.current!.position.y = drop / 2;
    coneMaterial.current!.opacity = (1 - flat) * (0.1 + 0.08 * pulseAt(time, 1.2));
    target.current!.scale.setScalar(lerp(1 + 0.06 * pulseAt(time, 1.2), 0.9, flat));
    target.current!.rotation.y = -time * 0.3 * (1 - flat);
    eye.current!.opacity = 0.55 + 0.45 * pulseAt(time, 1.2);
  });
  return (
    <group>
      <group ref={body}>
        <mesh castShadow raycast={ignoreRaycast} scale={[1, 0.32, 1]}>
          <sphereGeometry args={[0.2, 32, 16]} />
          <Body />
        </mesh>
        <mesh raycast={ignoreRaycast} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.2, 0.012, 8, 64]} />
          <Glow />
        </mesh>
        <mesh raycast={ignoreRaycast} position={[0, -0.062, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.05, 24]} />
          <Glow materialRef={eye} color={BEACON_HOT} />
        </mesh>
        {[0, 1, 2].map((index) => (
          <group key={index} rotation={[0, (index * Math.PI * 2) / 3, 0]}>
            <group
              position={[0.19, 0, 0]}
              ref={(group) => {
                fins.current[index] = group;
              }}
            >
              <mesh castShadow raycast={ignoreRaycast} position={[0.07, 0, 0]}>
                <boxGeometry args={[0.15, 0.018, 0.05]} />
                <Body />
              </mesh>
              <mesh raycast={ignoreRaycast} position={[0.145, 0, 0]}>
                <boxGeometry args={[0.012, 0.024, 0.056]} />
                <Glow />
              </mesh>
            </group>
          </group>
        ))}
      </group>
      <mesh ref={cone} raycast={ignoreRaycast}>
        <cylinderGeometry args={[0.05, 0.36, 1, 32, 1, true]} />
        <Glow materialRef={coneMaterial} additive />
      </mesh>
      <group ref={target} position={[0, 0.006, 0]}>
        <FlatRing inner={0.34} outer={0.36} opacity={0.9} />
        <FlatRing inner={0.2} outer={0.21} opacity={0.5} />
        <Crosshair inner={0.06} outer={0.44} width={0.014} opacity={0.75} />
      </group>
    </group>
  );
}

export const BEACON_VARIANTS = {
  lance: LanceBeacon,
  designator: DesignatorBeacon,
  pylon: PylonBeacon,
  drone: DroneBeacon,
} as const;
export type BeaconVariant = keyof typeof BEACON_VARIANTS;
