import { describe, expect, it } from "vitest";
import { formatCode, formatSvg } from "../formatCode";
import { createTestContext } from "../../../../test/createTestContext";
import { createSvgDocument } from "../../../svg/types";

describe("formatSvg", () => {
  it("breaks one-line markup into indented lines", () => {
    const input = `<svg xmlns="http://www.w3.org/2000/svg"><g><rect/></g></svg>`;
    const out = formatSvg(input, 2);
    const lines = out.split("\n");
    expect(lines.length).toBeGreaterThan(1);
    expect(out).toContain("\n  <g>");
    expect(out).toContain("\n    <rect");
  });

  it("keeps short text-only elements on a single line", () => {
    const out = formatSvg(
      `<svg xmlns="http://www.w3.org/2000/svg"><title>Hi</title></svg>`,
      2,
    );
    expect(out).toContain("<title>Hi</title>");
  });
});

describe("formatCode step", () => {
  it("produces multi-line output from minified input", () => {
    const ctx = createTestContext();
    const minified = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0h10v10z"/></svg>`;
    const [out] = formatCode.run(
      [createSvgDocument("a.svg", minified)],
      { indent: 2 },
      ctx,
    );
    expect(out.current.split("\n").length).toBeGreaterThan(1);
    expect(out.current).toContain("<path");
  });
});
