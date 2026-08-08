import { createPipelineContext } from "../lib/pipeline/context";
import type { PipelineContext } from "../lib/pipeline/context";

/**
 * Test helper that returns a fresh pipeline context backed by the jsdom
 * sandbox. getBBox is polyfilled via the vitest setup file.
 */
export function createTestContext(): PipelineContext {
  return createPipelineContext();
}
