/* @jsxImportSource @app/widgets/tabletop/three-jsx */
import { useFrame } from '@react-three/fiber/webgpu';
import type { RefObject } from 'react';
import { useEffect, useMemo, useRef } from 'react';
import type { Group, Material, Mesh, MeshBasicMaterial } from 'three';
import { AdditiveBlending, DoubleSide, NormalBlending, Shape, ShapeGeometry } from 'three';

import { ignoreRaycast } from '../../../../widgets/tabletop/ignoreRaycast';

/** What the beacon is doing, read every frame by the strike mark that draws it. */
export type BeaconPose = {
  /* 0 while it hovers, 1 once it lies flat on the territory it marks. */
  flat: number;
  /* How high the acrylic disc floats above the ground point under it. */
  height: number;
  /* 1 while the beacon shows, falling to 0 as it fades out over the battle it marks. */
  fade: number;
  carried: boolean;
  /* False when the player's motion preference asks for stillness: the mark then holds a resting pose. */
  motion: boolean;
};

const MARK = '#3fe0ff';
const MARK_HOT = '#d8fbff';
/* A dark wash under the mark keeps the cyan lines readable on pale sand. */
const UNDERLAY = '#06323a';
const ACRYLIC = '#bff2ff';

/* Radius of the acrylic disc a player picks up. */
const STRIKE_DISC_RADIUS = 0.16;
const DISC_THICKNESS = 0.045;
const FOOTPRINT = 0.27;
const DASHES = 12;

const lerp = (from: number, to: number, amount: number) => from + (to - from) * amount;
/* The clock the mark animates by, stopped at zero for players who ask for less motion. */
const beaconTime = (pose: BeaconPose) => (pose.motion ? performance.now() / 1000 : 0);
const pulseAt = (time: number, rate = 1.1) => 0.5 + 0.5 * Math.sin(time * Math.PI * 2 * rate);

/* Light in the air adds to what is behind it; marks on the ground are painted, so they stay cyan on bright sand. */
function Glow({
  opacity = 1,
  color = MARK,
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
      userData={materialRef ? undefined : { baseOpacity: opacity }}
      blending={additive ? AdditiveBlending : NormalBlending}
      depthWrite={false}
      side={DoubleSide}
      toneMapped={false}
      fog={false}
    />
  );
}

/** Four corner ticks around the footprint ring, as a targeting lock draws them. */
function useCornerTicks(half: number, arm: number, thickness: number) {
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

function Ring({
  inner,
  outer,
  y = 0,
  opacity = 1,
  color,
  start = 0,
  length = Math.PI * 2,
}: Readonly<{
  inner: number;
  outer: number;
  y?: number;
  opacity?: number;
  color?: string;
  start?: number;
  length?: number;
}>) {
  return (
    <mesh raycast={ignoreRaycast} rotation={[-Math.PI / 2, 0, 0]} position={[0, y, 0]}>
      <ringGeometry args={[inner, outer, 64, 1, start, length]} />
      <Glow opacity={opacity} color={color} />
    </mesh>
  );
}

/** A crosshair of four short bars with a gap in the middle, lying flat. */
function Crosshair({
  inner,
  outer,
  width,
  y = 0,
  opacity = 0.9,
}: Readonly<{ inner: number; outer: number; width: number; y?: number; opacity?: number }>) {
  const middle = (inner + outer) / 2;
  return (
    <group position={[0, y, 0]}>
      {[0, 1, 2, 3].map((index) => (
        <mesh
          key={index}
          raycast={ignoreRaycast}
          rotation={[-Math.PI / 2, 0, (index * Math.PI) / 2]}
          position={[Math.cos((index * Math.PI) / 2) * middle, 0, -Math.sin((index * Math.PI) / 2) * middle]}
        >
          <planeGeometry args={[outer - inner, width]} />
          <Glow opacity={opacity} />
        </mesh>
      ))}
    </group>
  );
}

/** The target the disc projects onto the ground: a ring with corner ticks, a turning dashed ring and a crosshair. */
function Footprint({ pose }: Readonly<{ pose: RefObject<BeaconPose> }>) {
  const ticks = useCornerTicks(FOOTPRINT + 0.05, 0.08, 0.016);
  const dashes = useRef<Group>(null);
  const footprint = useRef<Group>(null);
  useFrame(() => {
    const time = beaconTime(pose.current);
    const { flat } = pose.current;
    dashes.current!.rotation.y = time * 0.4;
    footprint.current!.scale.setScalar(lerp(1 + 0.04 * pulseAt(time), 1, flat));
  });
  const dash = (Math.PI * 2) / DASHES;
  return (
    <group ref={footprint} position={[0, 0.003, 0]}>
      <mesh raycast={ignoreRaycast} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[FOOTPRINT + 0.06, 64]} />
        <Glow color={UNDERLAY} opacity={0.42} />
      </mesh>
      <Ring inner={FOOTPRINT - 0.016} outer={FOOTPRINT} y={0.001} />
      <mesh raycast={ignoreRaycast} geometry={ticks} position={[0, 0.001, 0]}>
        <Glow />
      </mesh>
      <group ref={dashes} position={[0, 0.001, 0]}>
        {Array.from({ length: DASHES }, (_, index) => (
          <Ring key={index} inner={0.16} outer={0.172} start={index * dash} length={dash * 0.55} opacity={0.85} />
        ))}
      </group>
      <Crosshair inner={0.035} outer={0.12} width={0.014} y={0.001} />
      <mesh raycast={ignoreRaycast} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
        <circleGeometry args={[0.014, 24]} />
        <Glow color={MARK_HOT} />
      </mesh>
    </group>
  );
}

/**
 * The light the disc throws down: a faint open cone from the disc to the footprint, with a ring sliding down it so the target reads as projected.
 * It fades as the disc lands.
 */
function Projection({ pose }: Readonly<{ pose: RefObject<BeaconPose> }>) {
  const cone = useRef<Mesh>(null);
  const coneMaterial = useRef<MeshBasicMaterial>(null);
  const scan = useRef<Group>(null);
  const scanMaterial = useRef<MeshBasicMaterial>(null);
  useFrame(() => {
    const time = beaconTime(pose.current);
    const { flat, height } = pose.current;
    const length = Math.max(0.001, height * (1 - flat));
    const fade = 1 - flat;
    cone.current!.scale.set(1, length, 1);
    cone.current!.position.y = length / 2;
    coneMaterial.current!.opacity = pose.current.fade * fade * (0.035 + 0.025 * pulseAt(time, 0.9));
    const travel = (time * 0.7) % 1;
    scan.current!.position.y = length * (1 - travel);
    scan.current!.scale.setScalar(lerp(STRIKE_DISC_RADIUS * 0.85, FOOTPRINT, travel) / FOOTPRINT);
    scanMaterial.current!.opacity = pose.current.fade * fade * 0.55 * Math.sin(travel * Math.PI);
  });
  return (
    <group>
      <mesh ref={cone} raycast={ignoreRaycast}>
        <cylinderGeometry args={[STRIKE_DISC_RADIUS * 0.85, FOOTPRINT, 1, 48, 1, true]} />
        <Glow materialRef={coneMaterial} additive />
      </mesh>
      <group ref={scan}>
        <mesh raycast={ignoreRaycast} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[FOOTPRINT - 0.01, FOOTPRINT, 64]} />
          <Glow materialRef={scanMaterial} additive />
        </mesh>
      </group>
    </group>
  );
}

/** The acrylic disc a player picks up: clear and tinted, with a lit rim, an etched crosshair and an emitter underneath. */
function AcrylicDisc({ pose }: Readonly<{ pose: RefObject<BeaconPose> }>) {
  const disc = useRef<Group>(null);
  const emitter = useRef<MeshBasicMaterial>(null);
  useFrame(() => {
    const time = beaconTime(pose.current);
    const { flat, height, carried } = pose.current;
    const bob = carried ? 0 : 0.015 * Math.sin(time * 1.6);
    disc.current!.position.y = lerp(height + bob, DISC_THICKNESS / 2 + 0.006, flat);
    disc.current!.rotation.y = time * 0.25 * (1 - flat);
    emitter.current!.opacity = pose.current.fade * (1 - flat) * (0.6 + 0.4 * pulseAt(time, 1.4));
  });
  const top = DISC_THICKNESS / 2 + 0.001;
  return (
    <group ref={disc}>
      <mesh raycast={ignoreRaycast}>
        <cylinderGeometry args={[STRIKE_DISC_RADIUS, STRIKE_DISC_RADIUS, DISC_THICKNESS, 64]} />
        <meshPhysicalMaterial
          color={ACRYLIC}
          transparent
          opacity={0.38}
          userData={{ baseOpacity: 0.38 }}
          roughness={0.05}
          metalness={0}
          clearcoat={1}
          clearcoatRoughness={0.05}
          emissive={MARK}
          emissiveIntensity={0.12}
          depthWrite={false}
        />
      </mesh>
      <mesh raycast={ignoreRaycast} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[STRIKE_DISC_RADIUS, 0.005, 8, 64]} />
        <Glow color={MARK_HOT} />
      </mesh>
      <Ring inner={STRIKE_DISC_RADIUS * 0.62} outer={STRIKE_DISC_RADIUS * 0.66} y={top} opacity={0.75} />
      <Crosshair inner={0.02} outer={STRIKE_DISC_RADIUS * 0.85} width={0.008} y={top} opacity={0.75} />
      <mesh raycast={ignoreRaycast} rotation={[Math.PI / 2, 0, 0]} position={[0, -DISC_THICKNESS / 2 - 0.002, 0]}>
        <circleGeometry args={[0.035, 24]} />
        <Glow materialRef={emitter} color={MARK_HOT} additive />
      </mesh>
    </group>
  );
}

/**
 * The strike mark: an acrylic disc that hovers and projects a target onto the ground below it.
 * Dropped, the disc settles onto the target and the light goes out;
 * once the battle shows, the whole mark fades away.
 */
export function StrikeMark({ pose }: Readonly<{ pose: RefObject<BeaconPose> }>) {
  const root = useRef<Group>(null);
  const shownFade = useRef(1);
  useFrame(() => {
    const { fade } = pose.current;
    if (fade === shownFade.current) {
      return;
    }
    shownFade.current = fade;
    /* Fixed parts keep their own opacity in userData; the animated ones fold the fade in themselves. */
    root.current!.traverse((object) => {
      const material = (object as Mesh).material as Material | undefined;
      const base = material?.userData.baseOpacity as number | undefined;
      if (material && base !== undefined) {
        material.opacity = base * fade;
      }
    });
  });
  return (
    <group ref={root}>
      <Footprint pose={pose} />
      <Projection pose={pose} />
      <AcrylicDisc pose={pose} />
    </group>
  );
}
