import { describe, expect, it } from "vitest";
import { overrideColor } from "../overrideColor";
import { createTestContext } from "../../../../test/createTestContext";
import { createSvgDocument } from "../../../svg/types";

function doc(body: string) {
  return createSvgDocument(
    "a.svg",
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">${body}</svg>`,
  );
}

describe("overrideColor", () => {
  it("rewrites existing fill attributes", () => {
    const ctx = createTestContext();
    const [out] = overrideColor.run(
      [doc(`<path fill="#abc123" d="M0 0h10v10z"/>`)],
      { color: "#ff0000", target: "fill" },
      ctx,
    );
    expect(out.current).toContain('fill="#ff0000"');
    expect(out.current).not.toContain("#abc123");
  });

  it("sets fill on the root so default-black shapes recolor", () => {
    const ctx = createTestContext();
    const [out] = overrideColor.run(
      [doc(`<path d="M0 0h10v10z"/>`)],
      { color: "#00ff00", target: "fill" },
      ctx,
    );
    expect(out.current).toMatch(/<svg[^>]*\bfill="#00ff00"/);
  });

  it("preserves fill=none", () => {
    const ctx = createTestContext();
    const [out] = overrideColor.run(
      [doc(`<path fill="none" stroke="#000" d="M0 0h10"/>`)],
      { color: "#123456", target: "fill" },
      ctx,
    );
    expect(out.current).toContain('fill="none"');
  });

  it("recolors stroke only when targeted", () => {
    const ctx = createTestContext();
    const [out] = overrideColor.run(
      [doc(`<path fill="#aaa" stroke="#111" d="M0 0h10"/>`)],
      { color: "#222222", target: "stroke" },
      ctx,
    );
    expect(out.current).toContain('stroke="#222222"');
    expect(out.current).toContain('fill="#aaa"');
  });

  it("rewrites fill/stroke inside inline styles", () => {
    const ctx = createTestContext();
    const [out] = overrideColor.run(
      [doc(`<path style="fill:#abc;stroke:#def" d="M0 0h10"/>`)],
      { color: "#000000", target: "both" },
      ctx,
    );
    expect(out.current).toContain("fill:#000000");
    expect(out.current).toContain("stroke:#000000");
  });

  it("is a no-op when color is empty", () => {
    const ctx = createTestContext();
    const input = doc(`<path fill="#abc" d="M0 0h10"/>`);
    const [out] = overrideColor.run([input], { color: "", target: "fill" }, ctx);
    expect(out.current).toBe(input.current);
  });
});
