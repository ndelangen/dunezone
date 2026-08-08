import { beforeEach, describe, expect, it } from "vitest";
import {
  loadPrefs,
  savePrefs,
  loadPresets,
  savePreset,
  deletePreset,
  getPreset,
} from "../prefs";
import type { StepUiState } from "@/store/useAppStore";

const steps: Record<string, StepUiState> = {
  cropToContent: { enabled: true, config: { margin: 4 } },
  normalizeScale: { enabled: false, config: { width: 100, height: 100 } },
};

describe("prefs persistence", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("round-trips pipeline config through localStorage", () => {
    expect(loadPrefs()).toBeNull();
    savePrefs(steps);
    expect(loadPrefs()).toEqual(steps);
  });

  it("returns null on corrupt prefs", () => {
    localStorage.setItem("svgtool.prefs.v1", "{not json");
    expect(loadPrefs()).toBeNull();
  });
});

describe("presets", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("saves and retrieves a named preset", () => {
    savePreset("Icons", steps);
    expect(getPreset("Icons")?.steps).toEqual(steps);
  });

  it("upserts a preset by name without duplicating", () => {
    savePreset("Icons", steps);
    savePreset("Icons", { ...steps, cropToContent: { enabled: false, config: { margin: 0 } } });
    const list = loadPresets();
    expect(list.filter((p) => p.name === "Icons")).toHaveLength(1);
    expect(getPreset("Icons")?.steps.cropToContent.enabled).toBe(false);
  });

  it("keeps presets sorted by name", () => {
    savePreset("Zeta", steps);
    savePreset("Alpha", steps);
    expect(loadPresets().map((p) => p.name)).toEqual(["Alpha", "Zeta"]);
  });

  it("deletes a preset", () => {
    savePreset("Icons", steps);
    deletePreset("Icons");
    expect(getPreset("Icons")).toBeUndefined();
  });

  it("ignores empty preset names", () => {
    savePreset("   ", steps);
    expect(loadPresets()).toHaveLength(0);
  });
});
