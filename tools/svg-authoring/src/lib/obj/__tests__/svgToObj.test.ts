import { describe, expect, it } from "vitest";
import { svgToObj } from "../svgToObj";

const topRect = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="10" y="10" width="30" height="20" fill="#000"/></svg>`;
const square = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M10 10 H90 V90 H10 Z" fill="#000"/></svg>`;
const twoShapes = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M0 0 H40 V40 H0 Z"/><path d="M60 60 H100 V100 H60 Z"/></svg>`;
const blob = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M50 10 C80 10 90 40 50 90 C10 40 20 10 50 10 Z"/></svg>`;

function countLines(obj: string, prefix: string): number {
  return obj.split("\n").filter((l) => l.startsWith(prefix)).length;
}

function axisRange(obj: string, axis: "x" | "y" | "z"): [number, number] {
  const idx = axis === "x" ? 1 : axis === "y" ? 2 : 3;
  const vals = obj
    .split("\n")
    .filter((l) => l.startsWith("v "))
    .map((l) => Number(l.trim().split(/\s+/)[idx]));
  return [Math.min(...vals), Math.max(...vals)];
}

/** Parse OBJ and verify each face normal aligns with its vertex normals. */
function normalWindingMismatches(obj: string): number {
  const verts: Array<[number, number, number]> = [];
  const norms: Array<[number, number, number]> = [];
  const faces: Array<[number, number, number]> = [];

  for (const line of obj.split("\n")) {
    if (line.startsWith("v ")) {
      const [, x, y, z] = line.trim().split(/\s+/).map(Number);
      verts.push([x, y, z]);
    } else if (line.startsWith("vn ")) {
      const [, x, y, z] = line.trim().split(/\s+/).map(Number);
      norms.push([x, y, z]);
    } else if (line.startsWith("f ")) {
      const idx = line
        .trim()
        .slice(2)
        .split(/\s+/)
        .map((tok) => Number(tok.split("/")[0]) - 1);
      faces.push([idx[0], idx[1], idx[2]]);
    }
  }

  let mismatches = 0;
  for (const [a, b, c] of faces) {
    const [ax, ay, az] = verts[a];
    const [bx, by, bz] = verts[b];
    const [cx, cy, cz] = verts[c];
    const e1 = [bx - ax, by - ay, bz - az];
    const e2 = [cx - ax, cy - ay, cz - az];
    const fn = [
      e1[1] * e2[2] - e1[2] * e2[1],
      e1[2] * e2[0] - e1[0] * e2[2],
      e1[0] * e2[1] - e1[1] * e2[0],
    ];
    const flen = Math.hypot(fn[0], fn[1], fn[2]) || 1;
    const [nx, ny, nz] = norms[a];
    const dot = (fn[0] / flen) * nx + (fn[1] / flen) * ny + (fn[2] / flen) * nz;
    if (dot < 0.5) mismatches++;
  }
  return mismatches;
}

/** Average Y normal on the bottom face (y ≈ min). Should be negative when flat on ground. */
function avgBottomCapNy(obj: string): number {
  const verts: Array<[number, number, number]> = [];
  const norms: Array<[number, number, number]> = [];
  for (const line of obj.split("\n")) {
    if (line.startsWith("v ")) {
      const [, x, y, z] = line.trim().split(/\s+/).map(Number);
      verts.push([x, y, z]);
    } else if (line.startsWith("vn ")) {
      const [, x, y, z] = line.trim().split(/\s+/).map(Number);
      norms.push([x, y, z]);
    }
  }
  const minY = Math.min(...verts.map((v) => v[1]));
  let sum = 0;
  let n = 0;
  for (let i = 0; i < verts.length; i++) {
    if (Math.abs(verts[i][1] - minY) < 0.01) {
      sum += norms[i][1];
      n++;
    }
  }
  return n ? sum / n : 0;
}

describe("svgToObj", () => {
  it("lays flat on the ground with thickness along Y", async () => {
    const depth = 10;
    const obj = await svgToObj(topRect, { depth, curveSegments: 4 });
    const [minY, maxY] = axisRange(obj, "y");
    expect(minY).toBeCloseTo(0, 0);
    expect(maxY).toBeCloseTo(depth, 0);
  });

  it("exports outward-facing normals (not inside-out)", async () => {
    const obj = await svgToObj(topRect, { depth: 10, curveSegments: 4 });
    expect(obj).toContain("vn ");
    expect(normalWindingMismatches(obj)).toBe(0);
    // Bottom face (ground) should face -Y.
    expect(avgBottomCapNy(obj)).toBeLessThan(0);
  });

  it("produces OBJ text with vertices and faces from a path", async () => {
    const obj = await svgToObj(square, { depth: 10, curveSegments: 4 });
    expect(obj).toContain("v ");
    expect(obj).toContain("f ");
    expect(countLines(obj, "v ")).toBeGreaterThan(0);
    expect(countLines(obj, "f ")).toBeGreaterThan(0);
  });

  it("extrusion depth affects the Y height when laid flat", async () => {
    const shallow = await svgToObj(square, { depth: 1, curveSegments: 4 });
    const deep = await svgToObj(square, { depth: 50, curveSegments: 4 });
    expect(axisRange(deep, "y")[1]).toBeGreaterThan(axisRange(shallow, "y")[1]);
  });

  it("includes geometry for every shape in the document", async () => {
    const obj = await svgToObj(twoShapes, { depth: 5, curveSegments: 4 });
    expect(countLines(obj, "o ")).toBeGreaterThanOrEqual(2);
  });

  it("returns a non-empty string", async () => {
    const obj = await svgToObj(square);
    expect(obj.trim().length).toBeGreaterThan(0);
  });

  it("welding produces fewer vertices and an indexed mesh", async () => {
    const welded = await svgToObj(square, {
      depth: 10,
      curveSegments: 4,
      weld: true,
    });
    const raw = await svgToObj(square, {
      depth: 10,
      curveSegments: 4,
      weld: false,
    });
    expect(countLines(welded, "v ")).toBeLessThan(countLines(raw, "v "));
    expect(countLines(welded, "v ")).toBeGreaterThan(0);
  });

  it("omits normals when includeNormals is false", async () => {
    const obj = await svgToObj(square, {
      depth: 10,
      curveSegments: 4,
      includeNormals: false,
    });
    expect(obj).not.toContain("vn ");
    expect(obj).toContain("f ");
  });

  it("trims coordinate precision", async () => {
    const obj = await svgToObj(blob, {
      depth: 10,
      curveSegments: 8,
      precision: 2,
    });
    for (const line of obj.split("\n")) {
      if (!line.startsWith("v ")) continue;
      for (const tok of line.trim().split(/\s+/).slice(1)) {
        const dot = tok.indexOf(".");
        if (dot !== -1) {
          expect(tok.length - dot - 1).toBeLessThanOrEqual(2);
        }
      }
    }
  });

  it("smaller precision yields smaller output", async () => {
    const hi = await svgToObj(blob, { depth: 7, curveSegments: 8, precision: 6 });
    const lo = await svgToObj(blob, { depth: 7, curveSegments: 8, precision: 1 });
    expect(lo.length).toBeLessThan(hi.length);
  });
});
