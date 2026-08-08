import { describe, expect, it } from "vitest";
import { stampAuthored } from "../stampAuthored";
import { createTestContext } from "../../../../test/createTestContext";
import { createSvgDocument } from "../../../svg/types";

const base = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>`;

function doc() {
  return createSvgDocument("a.svg", base);
}

describe("stampAuthored", () => {
  it("stamps the root with the provenance attribute the dunezone verifier requires", () => {
    const ctx = createTestContext();
    const [out] = stampAuthored.run([doc()], { note: "" }, ctx);
    expect(out.current).toContain('data-authored="svg-authoring"');
  });

  it("appends the configured note", () => {
    const ctx = createTestContext();
    const [out] = stampAuthored.run([doc()], { note: "crop,flip" }, ctx);
    expect(out.current).toContain('data-authored="svg-authoring crop,flip"');
  });
});
