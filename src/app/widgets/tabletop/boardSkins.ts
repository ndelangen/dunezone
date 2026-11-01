import { gameAssetColors, rendererColors } from '@shared/play/assetColors';
import { Color } from 'three';
import type { Texture } from 'three';
import {
  abs,
  distance,
  dot,
  float,
  floor,
  fract,
  length,
  luminance,
  materialColor,
  max,
  min,
  mix,
  mx_cell_noise_float,
  mx_fractal_noise_float,
  mx_worley_noise_vec2,
  normalize,
  positionLocal,
  sin,
  transformNormalToView,
  smoothstep,
  vec2,
  vec3,
  vertexColor,
} from 'three/tsl';
import type { Node } from 'three/webgpu';
import { MeshStandardNodeMaterial } from 'three/webgpu';

/*
 * Board skins: a viewer's own look for the map's territory types, drawn by the board's material alone.
 * A skin shades the colour each territory already has, lighter or darker, and raises a relief the table's lights pick out;
 * it adds no hue of its own, and dark ink (borders, decals) stays flat and keeps its contrast.
 */

export const BOARD_SKINS = ['plain', 'parchment', 'marbled', 'dunes'] as const;
export type BoardSkin = (typeof BOARD_SKINS)[number];

export const BOARD_SKIN_LABELS: Record<BoardSkin, string> = {
  plain: 'Plain',
  parchment: 'Parchment',
  marbled: 'Marbled',
  dunes: 'Dunes',
};

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
const fbm = (p: V2, octaves: number): F => mx_fractal_noise_float(p, octaves, 2, 0.5);
const warp = (p: V2, scale: number, amount: number): V2 =>
  p.add(vec2(fbm(p.mul(scale), 3), fbm(p.mul(scale).add(vec2(5.2, 1.3)), 3)).mul(amount));
/** Distance to the nearest cell edge of a Worley pattern: 0 on the edge. */
const cellEdge = (p: V2, jitter: number): F => {
  const cells = mx_worley_noise_vec2(p, jitter);
  return cells.y.sub(cells.x);
};

/** A skin's look at one point: brightness (1 is the board's own colour) and a height in board units. */
type Surface = Readonly<{ shade: F; height: F }>;
type Layer = Readonly<{ sand: Surface; rock: Surface; stronghold: Surface; polar: Surface }>;

const flat = (shade: F): Surface => ({ shade, height: float(0) });

/** Aged paper: warped mottling, dark marble veins and grit, with the board darkening toward its rim. */
function parchment(p: V2): Layer {
  const mottle = fbm(warp(p, 0.8, 0.9).mul(2.2), 5);
  const veins = float(1).sub(smoothstep(0, 0.08, abs(fbm(warp(p, 1.1, 0.5).mul(1.6), 4))));
  const grit = fbm(p.mul(55), 2);
  const stain = smoothstep(0.1, 0.7, fbm(p.mul(0.9).add(vec2(9, 3)), 3));
  const paper = (strength: number) =>
    float(1)
      .add(mottle.mul(0.5 * strength))
      .sub(veins.mul(0.22 * strength))
      .add(grit.mul(0.08))
      .sub(stain.mul(0.25 * strength));
  return {
    sand: { shade: paper(1), height: mottle.mul(0.004) },
    rock: { shade: paper(1.3).mul(0.92), height: mottle.mul(0.006) },
    stronghold: { shade: paper(0.9), height: float(0) },
    polar: flat(float(1).add(mottle.mul(0.08))),
  };
}

/** Hammered, bubbly sand and rock spattered with dark grit, like a painted map. */
function marbled(p: V2): Layer {
  /* Puffy blobs: each Worley cell domes up from its edges, with a finer crinkle over them. */
  const cells = mx_worley_noise_vec2(warp(p, 1.5, 0.2).mul(11), 1);
  const bubbles = float(1)
    .sub(smoothstep(0, 0.8, cells.x))
    .pow(0.7);
  const fine = float(1).sub(smoothstep(0, 0.9, mx_worley_noise_vec2(p.mul(31).add(vec2(3.1, 7.7)), 1).x));
  const sandHeight = bubbles.mul(0.8).add(fine.mul(0.2));
  const spatter = smoothstep(0, 0.45, fbm(p.mul(26), 3)).mul(smoothstep(-0.3, 0.4, fbm(p.mul(2.4), 3)));
  const blotch = fbm(warp(p, 1.2, 0.4).mul(3), 4);
  return {
    sand: { shade: float(0.84).add(sandHeight.mul(0.28)), height: sandHeight.mul(0.012) },
    rock: {
      shade: float(1).add(blotch.mul(0.22)).sub(spatter.mul(0.6)),
      height: blotch.mul(0.006).sub(spatter.mul(0.003)),
    },
    stronghold: flat(float(1).add(blotch.mul(0.08))),
    polar: { shade: float(0.96).add(bubbles.mul(0.06)), height: bubbles.mul(0.002) },
  };
}

/** Deep desert relief: wind-cut dunes, ridged mountains, a city's blocks in each stronghold and cracked ice at the pole. */
function dunes(p: V2): Layer {
  const bent = warp(p, 0.7, 0.7);
  const across = dot(bent, vec2(0.83, 0.56));
  /* Long dunes with sharp crests, and small ripples running over them. */
  const dune = float(1)
    .sub(abs(sin(across.mul(7))))
    .pow(1.5);
  const ripple = sin(dot(warp(p, 2.5, 0.12), vec2(0.6, 0.8)).mul(70))
    .mul(0.5)
    .add(0.5);
  const sandHeight = dune.mul(0.045).add(ripple.mul(0.003));

  const ridged = float(1).sub(abs(fbm(warp(p, 1.3, 0.3).mul(3.2), 4)));
  const mountains = ridged.mul(ridged).mul(ridged);
  const scree = fbm(p.mul(40), 2);

  /* A city: a grid turned off the board's axes, each block its own height, with streets between. */
  const grid = vec2(dot(p, vec2(0.94, 0.34)), dot(p, vec2(-0.34, 0.94))).mul(30);
  const street = min(min(fract(grid.x), fract(grid.y)), float(1).sub(max(fract(grid.x), fract(grid.y))));
  const block = mx_cell_noise_float(floor(grid));
  const built = smoothstep(0.04, 0.12, street);
  const cityHeight = built.mul(block.mul(0.5).add(0.5)).mul(0.008);

  const ice = smoothstep(0, 0.08, cellEdge(warp(p, 2, 0.1).mul(9), 1));
  return {
    sand: { shade: float(0.8).add(dune.mul(0.3)).add(ripple.mul(0.06)), height: sandHeight },
    rock: { shade: float(0.62).add(mountains.mul(0.55)).add(scree.mul(0.06)), height: mountains.mul(0.06) },
    stronghold: { shade: float(0.72).add(built.mul(block.mul(0.3).add(0.2))), height: cityHeight },
    polar: { shade: float(0.8).add(ice.mul(0.2)), height: ice.mul(0.004) },
  };
}

const LAYERS: Record<Exclude<BoardSkin, 'plain'>, (p: V2) => Layer> = { parchment, marbled, dunes };

/** How dark the board grows toward its rim, per skin (0 leaves the rim as bright as the middle). */
const RIM_SHADE: Record<Exclude<BoardSkin, 'plain'>, number> = { parchment: 0.4, marbled: 0.15, dunes: 0.2 };

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
  if (skin === 'plain') {
    return material;
  }
  const p = positionLocal.xz;
  const layer = LAYERS[skin](p);
  const types = [
    [typeWeight(TYPE_COLORS.sand), layer.sand],
    [typeWeight(TYPE_COLORS.rock), layer.rock],
    [typeWeight(TYPE_COLORS.stronghold), layer.stronghold],
    [typeWeight(TYPE_COLORS.polar), layer.polar],
  ] as const;
  let shade: F = float(1);
  let height: F = float(0);
  for (const [weight, surface] of types) {
    shade = shade.add(surface.shade.sub(1).mul(weight));
    height = height.add(surface.height.mul(weight));
  }
  /* The board's own colour: its artwork, or the territory colours while the artwork loads. */
  const base = materialColor.rgb;
  /* Dark ink (borders, numerals, decals) stays flat and keeps its contrast. */
  const keep = smoothstep(0.03, 0.1, luminance(base));
  const rim = mix(float(1), float(1 - RIM_SHADE[skin]), smoothstep(2.2, 4, length(p)));
  material.colorNode = base.mul(float(1).add(shade.sub(1).mul(keep))).mul(rim);

  /* Finite differences over the plane tilt the normal, so the table's own lights model the relief. */
  const step = 0.006;
  const heightAt = (offset: V2) => {
    const shifted = LAYERS[skin](p.add(offset));
    let total: F = float(0);
    types.forEach(([weight], index) => {
      total = total.add([shifted.sand, shifted.rock, shifted.stronghold, shifted.polar][index].height.mul(weight));
    });
    return total;
  };
  const tilt = keep.div(step);
  const dx = heightAt(vec2(step, 0)).sub(height).mul(tilt);
  const dz = heightAt(vec2(0, step)).sub(height).mul(tilt);
  material.normalNode = transformNormalToView(normalize(vec3(dx.negate(), 1, dz.negate())));
  return material;
}
