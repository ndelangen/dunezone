import { describe, expect, it } from "vitest";
import { mirrorFlip } from "../mirrorFlip";
import { createTestContext } from "../../../../test/createTestContext";
import { createSvgDocument } from "../../../svg/types";

const base = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="10" y="10" width="20" height="20"/></svg>`;

function withFlip(x: boolean, y: boolean) {
  return { ...createSvgDocument("f.svg", base), flip: { x, y } };
}

describe("mirrorFlip", () => {
  it("does nothing when no flip is requested", () => {
    const ctx = createTestContext();
    const [out] = mirrorFlip.run([withFlip(false, false)], {}, ctx);
    expect(out.current).not.toContain("data-flip");
  });

  it("wraps content with a horizontal mirror transform", () => {
    const ctx = createTestContext();
    const [out] = mirrorFlip.run([withFlip(true, false)], {}, ctx);
    expect(out.current).toContain("data-flip");
    // mirror around cx=50 -> translate(100 0) scale(-1 1)
    expect(out.current).toContain("translate(100 0) scale(-1 1)");
  });

  it("wraps content with a vertical mirror transform", () => {
    const ctx = createTestContext();
    const [out] = mirrorFlip.run([withFlip(false, true)], {}, ctx);
    expect(out.current).toContain("translate(0 100) scale(1 -1)");
  });

  it("combines both axes", () => {
    const ctx = createTestContext();
    const [out] = mirrorFlip.run([withFlip(true, true)], {}, ctx);
    expect(out.current).toContain("translate(100 100) scale(-1 -1)");
  });

  it("is idempotent: re-running keeps a single flip wrapper", () => {
    const ctx = createTestContext();
    const [once] = mirrorFlip.run([withFlip(true, false)], {}, ctx);
    const doc2 = { ...once, flip: { x: true, y: false } };
    const [twice] = mirrorFlip.run([doc2], {}, ctx);
    const count = (twice.current.match(/data-flip/g) ?? []).length;
    expect(count).toBe(1);
  });

  it("unwraps when flip is toggled back off", () => {
    const ctx = createTestContext();
    const [flipped] = mirrorFlip.run([withFlip(true, false)], {}, ctx);
    const unflip = { ...flipped, flip: { x: false, y: false } };
    const [out] = mirrorFlip.run([unflip], {}, ctx);
    expect(out.current).not.toContain("data-flip");
    expect(out.current).toContain("<rect");
  });
});
