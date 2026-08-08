import { useState } from "react";
import { toast } from "sonner";
import { Save, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppStore } from "@/store/useAppStore";
import {
  loadPresets,
  savePreset,
  deletePreset,
  getPreset,
  type Preset,
} from "@/lib/persistence/prefs";

export function PresetBar() {
  const steps = useAppStore((s) => s.steps);
  const setSteps = useAppStore((s) => s.setSteps);
  const [presets, setPresets] = useState<Preset[]>(() => loadPresets());
  const [selected, setSelected] = useState<string>("");
  const [name, setName] = useState("");

  const applyPreset = (presetName: string) => {
    setSelected(presetName);
    const preset = getPreset(presetName);
    if (preset) {
      setSteps({ ...steps, ...preset.steps });
      toast.success(`Applied preset "${presetName}"`);
    }
  };

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const updated = savePreset(trimmed, steps);
    setPresets(updated);
    setName("");
    toast.success(`Saved preset "${trimmed}"`);
  };

  const handleDelete = () => {
    if (!selected) return;
    const updated = deletePreset(selected);
    setPresets(updated);
    setSelected("");
    toast.message(`Deleted preset`);
  };

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="preset-bar">
      <Select value={selected} onValueChange={applyPreset}>
        <SelectTrigger
          className="w-40"
          data-testid="preset-select"
          aria-label="Apply preset"
        >
          <SelectValue placeholder="Presets…" />
        </SelectTrigger>
        <SelectContent>
          {presets.length === 0 ? (
            <SelectItem value="__none" disabled>
              No presets saved
            </SelectItem>
          ) : (
            presets.map((p) => (
              <SelectItem key={p.name} value={p.name}>
                {p.name}
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Preset name"
        className="w-36"
        data-testid="preset-name"
      />
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={handleSave}
        disabled={name.trim().length === 0}
        data-testid="preset-save"
      >
        <Save /> Save
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={handleDelete}
        disabled={!selected}
        aria-label="Delete preset"
        data-testid="preset-delete"
      >
        <Trash2 />
      </Button>
    </div>
  );
}
