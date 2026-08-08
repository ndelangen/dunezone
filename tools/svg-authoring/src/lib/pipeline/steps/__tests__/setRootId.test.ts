import { describe, expect, it } from "vitest";
import { setRootId } from "../setRootId";
import { createTestContext } from "../../../../test/createTestContext";
import { createSvgDocument } from "../../../svg/types";

const base = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>`;

function doc() {
  return createSvgDocument("a.svg", base);
}

describe("setRootId", () => {
  it("applies the default root id from defaultConfig", () => {
    const ctx = createTestContext();
    const [out] = setRootId.run([doc()], setRootId.defaultConfig, ctx);
    expect(out.current).toContain('id="root"');
  });

  it("adds id=root by default", () => {
    const ctx = createTestContext();
    const [out] = setRootId.run([doc()], { id: "root" }, ctx);
    expect(out.current).toMatch(/<svg[^>]*\bid="root"/);
  });

  it("honors a custom id", () => {
    const ctx = createTestContext();
    const [out] = setRootId.run([doc()], { id: "icon" }, ctx);
    expect(out.current).toMatch(/<svg[^>]*\bid="icon"/);
  });

  it("overwrites an existing root id", () => {
    const ctx = createTestContext();
    const withId = createSvgDocument(
      "b.svg",
      base.replace("<svg ", '<svg id="old" '),
    );
    const [out] = setRootId.run([withId], { id: "root" }, ctx);
    expect(out.current).toMatch(/\bid="root"/);
    expect(out.current).not.toContain('id="old"');
  });

  it("is a no-op for an empty id", () => {
    const ctx = createTestContext();
    const [out] = setRootId.run([doc()], { id: "  " }, ctx);
    expect(out.current).not.toContain("id=");
  });
});
