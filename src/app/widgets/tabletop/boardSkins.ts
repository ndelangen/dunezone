import { gameAssetColors, rendererColors } from '@shared/play/assetColors';
import { Color } from 'three';
import type { Texture } from 'three';
import {
  distance,
  dot,
  float,
  luminance,
  materialColor,
  mx_fractal_noise_float,
  mx_worley_noise_vec2,
  normalize,
  positionLocal,
  sin,
  smoothstep,
  transformNormalToView,
  uniform,
  vec2,
  vec3,
  vertexColor,
} from 'three/tsl';
import type { Node } from 'three/webgpu';
import { MeshStandardNodeMaterial } from 'three/webgpu';

/*
 * Board skins: a viewer's own look for the map's territory types, drawn by the board's material alone.
 * A skin only scales the brightness of the colour each territory already has, so it adds no colour of its own,
 * and it fades out over dark ink (borders, decals) so everything the map says stays as legible as it was.
 */

export const BOARD_SKINS = ['plain', 'grain', 'windswept', 'relief', 'drifting'] as const;
export type BoardSkin = (typeof BOARD_SKINS)[number];

export const BOARD_SKIN_LABELS: Record<BoardSkin, string> = {
  plain: 'Plain',
  grain: 'Grain',
  windswept: 'Wind-swept',
  relief: 'Relief',
  drifting: 'Drifting sand',
};

/** Skins that change every frame; they draw only while motion is allowed and keep the table redrawing. */
export function boardSkinAnimates(skin: BoardSkin): boolean {
  return skin === 'drifting';
}

type F = Node<'float'>;
type V2 = Node<'vec2'>;

/* The territory type colours, in the same working space as the geometry's vertex colours. */
const TYPE_COLORS = {
  sand: new Color(gameAssetColors.mapSand),
  rock: new Color(gameAssetColors.mapRock),
  stronghold: new Color(gameAssetColors.mapStronghold),
  polar: new Color(rendererColors.white),
};

/** 1 inside a territory whose vertex colour is the type's own colour, 0 elsewhere (legacy decals and ink keep their look). */
function typeWeight(color: Color): F {
  return float(1).sub(smoothstep(0.01, 0.03, distance(vertexColor(0).rgb, vec3(color.r, color.g, color.b))));
}

/* Patterns over the board plane, in board units (the board's radius is about 4). */
const fbm = (p: V2, octaves: number) => mx_fractal_noise_float(p, octaves, 2, 0.5) as F;

function ripples(p: V2, phase: F): F {
  /* Sand ripples run across a slow wind, bent by a broad warp so no two dunes line up. */
  const warp = fbm(p.mul(0.9), 3).mul(5);
  const across = dot(p, vec2(0.83, 0.56)).mul(34).add(warp).add(phase);
  /* Sharp crests, long lee slopes. */
  return smoothstep(-0.2, 1, sin(across)) as F;
}

function strata(p: V2): F {
  const bend = fbm(p.mul(1.4), 2).mul(3);
  return sin(dot(p, vec2(-0.4, 0.92)).mul(22).add(bend))
    .mul(0.5)
    .add(0.5) as F;
}

function cracks(p: V2): F {
  const cells = mx_worley_noise_vec2(p.mul(5), 0.9) as V2;
  /* Close to a cell edge, the two nearest feature points are almost equally far. */
  return float(1).sub(smoothstep(0, 0.07, cells.y.sub(cells.x))) as F;
}

function blocks(p: V2): F {
  const cells = mx_worley_noise_vec2(p.mul(9), 0.35) as V2;
  return float(1).sub(smoothstep(0, 0.05, cells.y.sub(cells.x))) as F;
}

type Shading = Readonly<{ sand: F; rock: F; stronghold: F; polar: F }>;

/** The brightness each type gets at this point, 1 being the board's own colour. */
function shadingFor(skin: Exclude<BoardSkin, 'plain'>, p: V2, phase: F): Shading {
  switch (skin) {
    case 'grain':
      return {
        sand: float(1)
          .add(fbm(p.mul(16), 3).mul(0.07))
          .add(fbm(p.mul(70), 2).mul(0.04)),
        rock: float(1).add(fbm(p.mul(4), 4).mul(0.18)).add(fbm(p.mul(40), 2).mul(0.06)),
        stronghold: float(1).add(fbm(p.mul(11), 3).mul(0.08)),
        polar: float(1).add(fbm(p.mul(3), 3).mul(0.04)),
      };
    case 'windswept':
    case 'drifting':
    case 'relief': {
      const strength = skin === 'relief' ? 0.4 : 1;
      return {
        sand: float(1)
          .sub(ripples(p, phase).mul(0.1 * strength))
          .add(fbm(p.mul(60), 2).mul(0.03)),
        rock: float(1)
          .sub(strata(p).mul(0.08 * strength))
          .sub(cracks(p).mul(0.16 * strength))
          .add(fbm(p.mul(5), 3).mul(0.06)),
        stronghold: float(1)
          .sub(blocks(p).mul(0.12 * strength))
          .add(fbm(p.mul(12), 2).mul(0.03)),
        polar: float(1).add(fbm(p.mul(2.2).add(vec2(phase.mul(0.02), 0)), 3).mul(0.06)),
      };
    }
  }
}

/** A height field for the relief skin: dunes and strata stand up, cracks and mortar sink. */
function heightAt(p: V2, weights: Readonly<{ sand: F; rock: F; stronghold: F }>): F {
  const sand = ripples(p, float(0)).mul(weights.sand);
  const rock = strata(p).mul(0.6).sub(cracks(p).mul(0.35)).mul(weights.rock);
  const stronghold = blocks(p).negate().mul(weights.stronghold);
  return sand.add(rock).add(stronghold) as F;
}

export type BoardSkinMaterialOptions = Readonly<{
  /** True for the legacy map, whose shapes carry colour and alpha per vertex. */
  vertexColors: boolean;
  polygonOffset: boolean;
  map: Texture | null;
}>;

/** The board paint's material for one skin; `plain` is exactly the board's own look. */
export function createBoardSkinMaterial(skin: BoardSkin, options: BoardSkinMaterialOptions) {
  const material = new MeshStandardNodeMaterial({
    transparent: true,
    depthWrite: false,
    roughness: 0.88,
    metalness: 0,
    vertexColors: options.vertexColors,
    polygonOffset: options.polygonOffset,
    polygonOffsetFactor: options.polygonOffset ? -1 : 0,
    polygonOffsetUnits: options.polygonOffset ? -1 : 0,
    map: options.map,
  });
  /* Seconds of sand drift; the table advances it only while motion is allowed. */
  const drift = uniform(0);
  const advance = (seconds: number) => {
    drift.value += seconds;
  };
  if (skin === 'plain') {
    return { material, advance };
  }
  const p = positionLocal.xz;
  const weights = {
    sand: typeWeight(TYPE_COLORS.sand),
    rock: typeWeight(TYPE_COLORS.rock),
    stronghold: typeWeight(TYPE_COLORS.stronghold),
    polar: typeWeight(TYPE_COLORS.polar),
  };
  const shading = shadingFor(skin, p, drift.mul(0.35));
  const scale = float(1)
    .add(shading.sand.sub(1).mul(weights.sand))
    .add(shading.rock.sub(1).mul(weights.rock))
    .add(shading.stronghold.sub(1).mul(weights.stronghold))
    .add(shading.polar.sub(1).mul(weights.polar));
  /* The territory paint is opaque, so the skin keeps the colour (map or vertex colours) and leaves alpha to the vertex colours. */
  const base = materialColor.rgb;
  /* Dark ink (borders, numerals, decals) keeps its contrast: the skin fades out below mid brightness. */
  const keep = smoothstep(0.03, 0.1, luminance(base));
  const lit = float(1).add(scale.sub(1).mul(keep));
  material.colorNode = base.mul(lit);

  if (skin === 'relief') {
    /* Finite differences over the plane tilt the normal, so the table's own lights pick out the relief. */
    const step = 0.004;
    const h = heightAt(p, weights);
    const hx = heightAt(p.add(vec2(step, 0)), weights);
    const hz = heightAt(p.add(vec2(0, step)), weights);
    const slope = 0.012 / step;
    const tilt = keep.mul(slope);
    const normal = normalize(vec3(hx.sub(h).mul(tilt).negate(), 1, hz.sub(h).mul(tilt).negate()));
    material.normalNode = transformNormalToView(normal);
  }
  return { material, advance };
}
