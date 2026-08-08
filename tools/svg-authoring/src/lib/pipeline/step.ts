import type { SvgDocument } from "../svg/types";
import type { PipelineContext } from "./context";

export interface PipelineStep<TConfig = unknown> {
  id: string;
  label: string;
  description: string;
  defaultConfig: TConfig;
  /**
   * Transform the provided documents and return new documents. Steps must be
   * pure with respect to React state: they only read `current` and produce a
   * new `current`. `original` must never be mutated.
   */
  run(
    docs: SvgDocument[],
    config: TConfig,
    ctx: PipelineContext,
  ): SvgDocument[];
}

export type StepId = string;

/** A step paired with the config it should run with. */
export interface StepInvocation<TConfig = unknown> {
  step: PipelineStep<TConfig>;
  config: TConfig;
}
