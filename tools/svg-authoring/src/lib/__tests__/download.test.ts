import { describe, expect, it } from "vitest";
import { zipFilename, ensureExtension, replaceExtension } from "../download";

describe("zipFilename", () => {
  it("appends .zip when missing", () => {
    expect(zipFilename("my-icons")).toBe("my-icons.zip");
  });

  it("does not double the extension", () => {
    expect(zipFilename("my-icons.zip")).toBe("my-icons.zip");
    expect(zipFilename("my-icons.ZIP")).toBe("my-icons.zip");
  });

  it("trims whitespace", () => {
    expect(zipFilename("  pack  ")).toBe("pack.zip");
  });

  it("falls back when empty", () => {
    expect(zipFilename("")).toBe("export.zip");
    expect(zipFilename("   ", "bundle")).toBe("bundle.zip");
  });
});

describe("extension helpers", () => {
  it("ensureExtension only adds when needed", () => {
    expect(ensureExtension("a", ".svg")).toBe("a.svg");
    expect(ensureExtension("a.svg", ".svg")).toBe("a.svg");
  });

  it("replaceExtension swaps the suffix", () => {
    expect(replaceExtension("a.svg", ".obj")).toBe("a.obj");
    expect(replaceExtension("a", ".obj")).toBe("a.obj");
  });
});
