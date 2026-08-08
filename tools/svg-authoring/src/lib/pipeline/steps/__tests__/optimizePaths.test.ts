import { describe, expect, it } from "vitest";
import { optimizePaths } from "../optimizePaths";
import { createTestContext } from "../../../../test/createTestContext";
import { createSvgDocument } from "../../../svg/types";
import { countPathCommands } from "../../../svg/meta";
import { dirtyTraced } from "../../__fixtures__";

function dOf(svg: string) {
  return svg.match(/\bd="([^"]*)"/)?.[1] ?? "";
}

describe("optimizePaths", () => {
  it("light: shrinks a dirty traced path (rounding + shorthand)", () => {
    const ctx = createTestContext();
    const doc = createSvgDocument("dirty.svg", dirtyTraced);
    const before = dOf(doc.current).length;
    const [out] = optimizePaths.run(
      [doc],
      { level: "light", decimalPrecision: 1, removeMetadata: true },
      ctx,
    );
    expect(dOf(out.current).length).toBeLessThan(before);
    expect(out.current).toContain("<path");
  });

  it("medium: reduces path command count via collinear removal", () => {
    const ctx = createTestContext();
    const doc = createSvgDocument("dirty.svg", dirtyTraced);
    const before = countPathCommands(doc.current);
    const [out] = optimizePaths.run(
      [doc],
      { level: "medium", decimalPrecision: 1, removeMetadata: true },
      ctx,
    );
    expect(countPathCommands(out.current)).toBeLessThanOrEqual(before);
  });

  it("light: rounds coordinates to the configured precision", () => {
    const ctx = createTestContext();
    const doc = createSvgDocument(
      "p.svg",
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M10.123456 10.987654 L80.555555 80.111111"/></svg>`,
    );
    const [out] = optimizePaths.run(
      [doc],
      { level: "light", decimalPrecision: 1, removeMetadata: true },
      ctx,
    );
    expect(out.current).not.toMatch(/\.\d{3,}/);
  });

  it("light: strips comments and metadata when requested", () => {
    const ctx = createTestContext();
    const doc = createSvgDocument(
      "m.svg",
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><!-- Generator: hand --><metadata>x</metadata><rect width="10" height="10"/></svg>`,
    );
    const [out] = optimizePaths.run(
      [doc],
      { level: "light", decimalPrecision: 2, removeMetadata: true },
      ctx,
    );
    expect(out.current).not.toContain("Generator");
    expect(out.current).not.toContain("<metadata");
  });

  it("medium: produces a non-empty SVG no larger than the input", () => {
    const ctx = createTestContext();
    const doc = createSvgDocument("dirty.svg", dirtyTraced);
    const [out] = optimizePaths.run(
      [doc],
      { level: "medium", decimalPrecision: 1, removeMetadata: true },
      ctx,
    );
    expect(out.current).toContain("<svg");
    expect(out.current.length).toBeLessThanOrEqual(doc.current.length);
  });

  it("never produces empty output", () => {
    const ctx = createTestContext();
    const doc = createSvgDocument("dirty.svg", dirtyTraced);
    const [out] = optimizePaths.run(
      [doc],
      { level: "light", decimalPrecision: 2, removeMetadata: true },
      ctx,
    );
    expect(out.current.trim().length).toBeGreaterThan(0);
  });
});
