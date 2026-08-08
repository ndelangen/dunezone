import type { StepUiState } from "@/store/useAppStore";

const PREFS_KEY = "svgtool.prefs.v1";
const PRESETS_KEY = "svgtool.presets.v1";

type StepsState = Record<string, StepUiState>;

function safeStorage(): Storage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

export function loadPrefs(): StepsState | null {
  const s = safeStorage();
  if (!s) return null;
  const raw = s.getItem(PREFS_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as StepsState) : null;
  } catch {
    return null;
  }
}

export function savePrefs(steps: StepsState): void {
  const s = safeStorage();
  if (!s) return;
  try {
    s.setItem(PREFS_KEY, JSON.stringify(steps));
  } catch {
    /* quota / disabled storage — ignore */
  }
}

export interface Preset {
  name: string;
  steps: StepsState;
}

export function loadPresets(): Preset[] {
  const s = safeStorage();
  if (!s) return [];
  const raw = s.getItem(PRESETS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Preset[]) : [];
  } catch {
    return [];
  }
}

function writePresets(presets: Preset[]): void {
  const s = safeStorage();
  if (!s) return;
  try {
    s.setItem(PRESETS_KEY, JSON.stringify(presets));
  } catch {
    /* ignore */
  }
}

/** Upsert a preset by name; returns the updated list. */
export function savePreset(name: string, steps: StepsState): Preset[] {
  const trimmed = name.trim();
  if (!trimmed) return loadPresets();
  const presets = loadPresets().filter((p) => p.name !== trimmed);
  presets.push({ name: trimmed, steps });
  presets.sort((a, b) => a.name.localeCompare(b.name));
  writePresets(presets);
  return presets;
}

export function deletePreset(name: string): Preset[] {
  const presets = loadPresets().filter((p) => p.name !== name);
  writePresets(presets);
  return presets;
}

export function getPreset(name: string): Preset | undefined {
  return loadPresets().find((p) => p.name === name);
}
