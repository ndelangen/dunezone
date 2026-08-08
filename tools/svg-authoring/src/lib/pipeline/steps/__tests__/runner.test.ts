import { describe, expect, it } from "vitest";
import { runStep, runPipeline } from "../../runner";
import { cropToContent } from "../cropToContent";
import { createTestContext } from "../../../../test/createTestContext";
import { createSvgDocument } from "../../../svg/types";
import { looseViewBox, multiShape } from "../../__fixtures__";

describe("pipeline runner", () => {
  it("runs a single step and recomputes metadata", () => {
    const ctx = createTestContext();
    const docs = [createSvgDocument("loose.svg", looseViewBox)];
    const out = runStep(docs, cropToContent, { marginRatio: 0 }, ctx);
    expect(out[0].meta.viewBox).toEqual([20, 30, 30, 20]);
    expect(out[0].meta.aspectRatio).toBeCloseTo(30 / 20);
  });

  it("only processes selected documents by default", () => {
    const ctx = createTestContext();
    const selected = createSvgDocument("a.svg", looseViewBox);
    const unselected = { ...createSvgDocument("b.svg", multiShape), selected: false };
    const out = runStep([selected, unselected], cropToContent, { marginRatio: 0 }, ctx);
    expect(out[0].current).not.toBe(looseViewBox);
    // untouched doc keeps its original current string
    expect(out[1].current).toBe(multiShape);
  });

  it("processes all documents when onlySelected is false", () => {
    const ctx = createTestContext();
    const unselected = { ...createSvgDocument("b.svg", multiShape), selected: false };
    const out = runStep([unselected], cropToContent, { marginRatio: 0 }, ctx, {
      onlySelected: false,
    });
    expect(out[0].meta.viewBox).toEqual([10, 10, 60, 40]);
  });

  it("threads documents through an ordered pipeline", () => {
    const ctx = createTestContext();
    const docs = [createSvgDocument("loose.svg", looseViewBox)];
    const out = runPipeline(
      docs,
      [{ step: cropToContent, config: { marginRatio: 0.1 } }],
      ctx,
    );
    // content 20,30,30,20; margin = 0.1 * 30 = 3
    expect(out[0].meta.viewBox).toEqual([17, 27, 36, 26]);
  });
});
