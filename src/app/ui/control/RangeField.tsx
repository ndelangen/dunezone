import { NumberInput, Slider } from '@mantine/core';
import type { ReactNode } from 'react';

import { ControlBlock } from './ControlBlock';

export interface RangeFieldProps {
  /** The field's visible name, "Icon scale". */
  title: string;
  /** A constraint the slider cannot show, behind the (?) mark: "1 is the reference size". */
  description?: ReactNode;
  /**
   * What a screen reader calls the number box, when the visible title leans on its surroundings:
   * "Horizontal offset" under an icon's heading is "Horizontal icon offset" on its own.
   * The slider takes the same name with "slider" after it.
   */
  name?: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  /** Places the box and the slider's label show; the step's own places when omitted, so 0.05 shows two and 1 shows none. Set it when stored values can be finer than the step. */
  decimals?: number;
  /**
   * Lets a typed value go past the slider's ends: the slider is for reach and the box for precision, so an offset can sit off the card.
   * Leave it off for a value with real limits, a scale or an opacity.
   */
  typedBeyondRange?: boolean;
}

/** Decimal places a step implies, so 0.05 shows two and 1 shows none. Reads the plain decimal spelling, which every step in the app has. */
function decimalsOf(step: number) {
  const [, fraction = ''] = String(step).split('.');
  return fraction.length;
}

/**
 * A number set by dragging, with its exact value typed beside it.
 *
 * Callers own the value, its bounds and its step;
 * this owns the pairing: the slider and the number box share one range, one step and one way of showing the value, and both are named from one title.
 * Typing past either end is held to the range when the box loses focus, unless the caller says the range is only the slider's reach.
 */
export function RangeField({
  title,
  description,
  name = title,
  value,
  onChange,
  min,
  max,
  step = 1,
  decimals = decimalsOf(step),
  typedBeyondRange = false,
}: RangeFieldProps) {
  return (
    <ControlBlock
      title={title}
      description={description}
      tool={
        <NumberInput
          aria-label={name}
          w={96}
          {...(typedBeyondRange ? {} : { min, max })}
          step={step}
          decimalScale={decimals}
          value={value}
          onChange={(next) => {
            if (typeof next === 'number') {
              onChange(next);
            }
          }}
        />
      }
      input={
        <Slider
          aria-label={`${name} slider`}
          thumbLabel={`${name} slider`}
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={onChange}
          label={(shown) => shown.toFixed(decimals)}
        />
      }
    />
  );
}
