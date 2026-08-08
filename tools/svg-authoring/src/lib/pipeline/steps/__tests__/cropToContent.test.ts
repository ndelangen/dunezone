import { describe, expect, it } from "vitest";
import { cropToContent } from "../cropToContent";
import { createTestContext } from "../../../../test/createTestContext";
import { createSvgDocument } from "../../../svg/types";
import { parseViewBox } from "../../../svg/meta";
import { looseViewBox, multiShape } from "../../__fixtures__";

function viewBoxOf(svg: string) {
  const match = svg.match(/viewBox="([^"]+)"/);
  return match ? parseViewBox(match[1]) : null;
}

describe("cropToContent", () => {
  it("trims viewBox tightly with zero margin", () => {
    const ctx = createTestContext();
    const docs = [createSvgDocument("loose.svg", looseViewBox)];
    const [out] = cropToContent.run(docs, { marginRatio: 0 }, ctx);
    expect(viewBoxOf(out.current)).toEqual([20, 30, 30, 20]);
  });

  it("expands the trim box by a margin proportional to the larger dimension", () => {
    const ctx = createTestContext();
    const docs = [createSvgDocument("loose.svg", looseViewBox)];
    const [out] = cropToContent.run(docs, { marginRatio: 0.1 }, ctx);
    // content 20,30,30,20; margin = 0.1 * max(30,20) = 3 -> 17,27,36,26
    expect(viewBoxOf(out.current)).toEqual([17, 27, 36, 26]);
  });

  it("unions multiple shapes into a single content box", () => {
    const ctx = createTestContext();
    const docs = [createSvgDocument("multi.svg", multiShape)];
    const [out] = cropToContent.run(docs, { marginRatio: 0 }, ctx);
    expect(viewBoxOf(out.current)).toEqual([10, 10, 60, 40]);
  });

  it("never mutates the original source", () => {
    const ctx = createTestContext();
    const doc = createSvgDocument("loose.svg", looseViewBox);
    const [out] = cropToContent.run([doc], { marginRatio: 0 }, ctx);
    expect(out.original).toBe(looseViewBox);
    expect(out.current).not.toBe(looseViewBox);
  });
});
