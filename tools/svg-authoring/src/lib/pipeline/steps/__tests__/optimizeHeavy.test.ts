import { describe, expect, it, beforeAll } from "vitest";
import { optimizePaths } from "../optimizePaths";
import { ensureSvgo, getSvgo } from "../../../svg/svgoLoader";
import { createTestContext } from "../../../../test/createTestContext";
import { createSvgDocument } from "../../../svg/types";
import { dirtyTraced } from "../../__fixtures__";

describe("optimizePaths (heavy / SVGO)", () => {
  beforeAll(async () => {
    await ensureSvgo();
  });

  it("loads SVGO lazily", () => {
    expect(getSvgo()).not.toBeNull();
  });

  it("heavy optimize shrinks a dirty SVG and preserves the viewBox", () => {
    const ctx = createTestContext();
    const verbose = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">\n  <!-- generated -->\n  <g>\n    <rect x="10.000001" y="10.000002" width="20.0000005" height="20" fill="#222222"/>\n  </g>\n</svg>`;
    const doc = createSvgDocument("v.svg", verbose);
    const [out] = optimizePaths.run(
      [doc],
      { level: "heavy", decimalPrecision: 1, removeMetadata: true },
      ctx,
    );
    expect(out.current.length).toBeLessThan(verbose.length);
    expect(out.current).toContain("viewBox");
    expect(out.current).toContain("<svg");
  });

  it("never produces empty output for traced input", () => {
    const ctx = createTestContext();
    const [out] = optimizePaths.run(
      [createSvgDocument("d.svg", dirtyTraced)],
      { level: "heavy", decimalPrecision: 2, removeMetadata: true },
      ctx,
    );
    expect(out.current.trim().length).toBeGreaterThan(0);
    expect(out.current).toContain("<svg");
  });
});
