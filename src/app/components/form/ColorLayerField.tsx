import { Plus, Trash2 } from 'lucide-react';

import { UIButton } from '@app/components/generic/ui/UIButton';

import styles from './ColorLayerField.module.css';
import { FormTooltip } from './FormTooltip';
import { HexColorPicker } from './HexColorPicker';
import { TextField } from './TextField';

export type ColorStop = [string, number];

export type LinearGradientColor = {
  type: 'linear';
  angle: number;
  stops: ColorStop[];
};

export type RadialGradientColor = {
  type: 'radial';
  stops: ColorStop[];
  x?: number;
  y?: number;
  r?: number;
};

export type ColorLayerValue = string | LinearGradientColor | RadialGradientColor;

export interface ColorLayerFieldProps {
  legend: string;
  value: ColorLayerValue;
  onChange: (next: ColorLayerValue) => void;
  idPrefix: string;
}

const defaultLinear = (): LinearGradientColor => ({
  type: 'linear',
  angle: 90,
  stops: [
    ['#000000', 0],
    ['#ffffff', 1],
  ],
});

const defaultRadial = (): RadialGradientColor => ({
  type: 'radial',
  stops: [
    ['#000000', 0],
    ['#ffffff', 1],
  ],
});

function isHex(v: ColorLayerValue): v is string {
  return typeof v === 'string';
}

export function ColorLayerField({ legend, value, onChange, idPrefix }: ColorLayerFieldProps) {
  const mode = isHex(value) ? 'hex' : 'gradient';

  return (
    <fieldset className={styles.colorSlotFieldset}>
      <legend className={styles.colorSlotLegend}>{legend}</legend>

      <div className={styles.colorModeRow}>
        <label className={styles.radioLabel}>
          <input
            type="radio"
            name={`${idPrefix}-mode`}
            checked={mode === 'hex'}
            onChange={() => {
              if (isHex(value)) onChange(value);
              else {
                const h = value.stops[0]?.[0] ?? '';
                onChange(/^#[0-9a-f]{6}$/i.test(h) ? h : '#000000');
              }
            }}
          />
          Solid color
        </label>
        <label className={styles.radioLabel}>
          <input
            type="radio"
            name={`${idPrefix}-mode`}
            checked={mode === 'gradient'}
            onChange={() => {
              if (!isHex(value)) onChange(value);
              else {
                const h = /^#[0-9a-f]{6}$/i.test(value) ? value : '#000000';
                onChange({
                  ...defaultLinear(),
                  stops: [
                    [h, 0],
                    [h, 1],
                  ],
                });
              }
            }}
          />
          Gradient
        </label>
      </div>

      {mode === 'hex' && isHex(value) && (
        <HexColorPicker
          pickerId={`${idPrefix}-picker`}
          textId={`${idPrefix}-hex`}
          value={value}
          onChange={(h) => onChange(h)}
          pickerAriaLabel="Pick background color"
        />
      )}

      {mode === 'gradient' && !isHex(value) && (
        <GradientEditor idPrefix={idPrefix} value={value} onChange={onChange} />
      )}
    </fieldset>
  );
}

function GradientEditor({
  value,
  onChange,
  idPrefix,
}: {
  value: LinearGradientColor | RadialGradientColor;
  onChange: (next: ColorLayerValue) => void;
  idPrefix: string;
}) {
  const setLinear = () => {
    if (value.type === 'linear') return;
    onChange({ ...defaultLinear(), stops: [...value.stops] });
  };
  const setRadial = () => {
    if (value.type === 'radial') return;
    onChange({ ...defaultRadial(), stops: [...value.stops] });
  };

  const updateStops = (stops: ColorStop[]) => {
    onChange({ ...value, stops });
  };

  const addStop = () => {
    const last = value.stops[value.stops.length - 1];
    const hex = last?.[0] ?? '#888888';
    const pos = Math.min(1, (last?.[1] ?? 1) + 0.01);
    updateStops([...value.stops, [hex, pos]]);
  };

  const removeStop = (i: number) => {
    if (value.stops.length <= 2) return;
    updateStops(value.stops.filter((_, j) => j !== i));
  };

  return (
    <div className={styles.gradientWrap}>
      <div className={styles.colorModeRow}>
        <label className={styles.radioLabel}>
          <input
            type="radio"
            name={`${idPrefix}-gtype`}
            checked={value.type === 'linear'}
            onChange={setLinear}
          />
          Linear
        </label>
        <label className={styles.radioLabel}>
          <input
            type="radio"
            name={`${idPrefix}-gtype`}
            checked={value.type === 'radial'}
            onChange={setRadial}
          />
          Radial
        </label>
      </div>

      {value.type === 'linear' && (
        <label className={styles.sliderLabel}>
          Angle (0-360deg)
          <span className={styles.sliderValue}>{value.angle}</span>
          <input
            type="range"
            min={0}
            max={360}
            step={1}
            value={value.angle}
            onChange={(e) =>
              onChange({ ...value, angle: Number.parseInt(e.target.value, 10) || 0 })
            }
          />
        </label>
      )}

      {value.type === 'radial' && (
        <div className={styles.radialGrid}>
          <label htmlFor={`${idPrefix}-radial-x`}>
            x (optional)
            <TextField
              id={`${idPrefix}-radial-x`}
              type="number"
              step="0.01"
              className={styles.hexText}
              value={value.x ?? ''}
              placeholder="default"
              onChange={(e) => {
                const v = e.target.value;
                onChange({
                  ...value,
                  x: v === '' ? undefined : Number.parseFloat(v),
                });
              }}
            />
          </label>
          <label htmlFor={`${idPrefix}-radial-y`}>
            y (optional)
            <TextField
              id={`${idPrefix}-radial-y`}
              type="number"
              step="0.01"
              className={styles.hexText}
              value={value.y ?? ''}
              placeholder="default"
              onChange={(e) => {
                const v = e.target.value;
                onChange({
                  ...value,
                  y: v === '' ? undefined : Number.parseFloat(v),
                });
              }}
            />
          </label>
          <label htmlFor={`${idPrefix}-radial-r`}>
            r (optional)
            <TextField
              id={`${idPrefix}-radial-r`}
              type="number"
              step="0.01"
              className={styles.hexText}
              value={value.r ?? ''}
              placeholder="default"
              onChange={(e) => {
                const v = e.target.value;
                onChange({
                  ...value,
                  r: v === '' ? undefined : Number.parseFloat(v),
                });
              }}
            />
          </label>
        </div>
      )}

      <p className={styles.stopsHint}>Gradient stops (color + position 0-1). At least two stops.</p>
      {value.stops.map((stop, i) => (
        <div key={`${idPrefix}-stop-${i}`} className={styles.stopRow}>
          <HexColorPicker
            pickerId={`${idPrefix}-stop-${i}-picker`}
            textId={`${idPrefix}-stop-${i}-hex`}
            value={stop[0]}
            onChange={(h) => {
              const next = [...value.stops] as ColorStop[];
              next[i] = [h, stop[1]];
              updateStops(next);
            }}
            pickerAriaLabel={`Stop ${i + 1} color`}
          />
          <label className={styles.sliderLabel}>
            <span className={styles.sliderValue}>{stop[1].toFixed(2)}</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={stop[1]}
              onChange={(e) => {
                const next = [...value.stops] as ColorStop[];
                next[i] = [stop[0], Number.parseFloat(e.target.value) || 0];
                updateStops(next);
              }}
            />
          </label>
          <FormTooltip content={`Remove stop ${i + 1}`}>
            <UIButton
              type="button"
              variant="critical"
              iconOnly
              aria-label={`Remove stop ${i + 1}`}
              disabled={value.stops.length <= 2}
              onClick={() => removeStop(i)}
            >
              <Trash2 size={16} aria-hidden />
            </UIButton>
          </FormTooltip>
        </div>
      ))}
      <FormTooltip content="Add gradient stop">
        <UIButton
          type="button"
          variant="secondary"
          iconOnly
          aria-label="Add gradient stop"
          onClick={addStop}
        >
          <Plus size={16} aria-hidden />
        </UIButton>
      </FormTooltip>
    </div>
  );
}
