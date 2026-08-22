/**
 * Media/vector/** → public/obj/** OBJ generator (wayfinder #294, ticket #309).
 *
 * Categories flagged `obj: true` in the rules become committed Wavefront .obj game pieces for TTS's later use.
 * Sources go through the SAME normalization as the SVG train (shared 100-box geometry), then the tool's spike-verified three.js chain (src/shared/svgToObj.ts).
 *
 * Bun run generate:objs
 *
 * Unlike public/image and public/vector, the OBJ output is COMMITTED: the bytes sit outside the renderer identity, three is exactly pinned, and CI regenerates-and-diffs to guard determinism (research #295, byte-identical across runtimes;
 * the arc-command files are the macOS↔Linux sentinel).
 */
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { DOMParser } from 'linkedom';

import { svgToObj } from '../src/shared/svgToObj';
import type { ObjExportOptions } from '../src/shared/svgToObj';
import { normalizeSvg } from '../src/shared/vectorNormalize';
import { VECTOR_CATEGORY_RULES } from '../src/shared/vectorRules';
import { linkedomDom } from './generate-vectors';

// SVGLoader parses via the DOMParser global; linkedom's is the spike-verified headless stand-in.
(globalThis as { DOMParser?: unknown }).DOMParser = DOMParser;

const repoRoot = path.resolve(import.meta.dirname, '..');
const mediaRoot = path.join(repoRoot, 'media/vector');
const objRoot = path.join(repoRoot, 'public/obj');

/**
 * Sized for committed tabletop pieces: normals dropped (extruded tokens are flat-shaded and importers recompute), curveSegments 6 and 3 decimals in the 100-box.
 * That takes the fleet from 32 MB to ~4 MB versus the tool's interactive defaults.
 */
const PIECE_OPTIONS: ObjExportOptions = {
  depth: 10,
  curveSegments: 6,
  precision: 3,
  weld: true,
  includeNormals: false,
};

if (import.meta.main) {
  rmSync(objRoot, { recursive: true, force: true });
  let generated = 0;
  const failures: string[] = [];

  for (const [category, rule] of Object.entries(VECTOR_CATEGORY_RULES)) {
    if (!rule.obj) {
      continue;
    }
    const categoryDirectory = path.join(mediaRoot, category);
    for (const file of readdirSync(categoryDirectory).filter((name) => name.endsWith('.svg'))) {
      try {
        const source = readFileSync(path.join(categoryDirectory, file), 'utf8');
        const normalized = normalizeSvg(source, linkedomDom);
        const obj = svgToObj(normalized, PIECE_OPTIONS);
        const destination = path.join(objRoot, category, file.replace(/\.svg$/, '.obj'));
        mkdirSync(path.dirname(destination), { recursive: true });
        writeFileSync(destination, obj);
        generated += 1;
      } catch (error) {
        failures.push(`${category}/${file}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  if (failures.length > 0) {
    console.error(failures.join('\n'));
    console.error(`\n${failures.length} obj generation failure(s)`);
    process.exit(1);
  }
  console.log(JSON.stringify({ ok: true, generated }));
}
