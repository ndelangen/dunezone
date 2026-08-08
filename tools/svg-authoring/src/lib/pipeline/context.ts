/**
 * A PipelineContext provides DOM parsing/serialization plus an off-screen
 * sandbox used for geometry measurement (getBBox). Steps receive a context so
 * that the same measurement machinery can be reused across an entire batch and
 * swapped out in tests.
 */
export interface PipelineContext {
  sandbox: HTMLElement;
  parse(svg: string): SVGSVGElement;
  serialize(el: SVGSVGElement): string;
  release(el: Element): void;
  dispose(): void;
}

const SANDBOX_ID = "__svg_pipeline_sandbox__";

function createSandbox(): HTMLElement {
  const existing = document.getElementById(SANDBOX_ID);
  if (existing) return existing;
  const el = document.createElement("div");
  el.id = SANDBOX_ID;
  el.setAttribute("aria-hidden", "true");
  Object.assign(el.style, {
    position: "fixed",
    left: "-99999px",
    top: "0",
    width: "0",
    height: "0",
    overflow: "hidden",
    pointerEvents: "none",
    opacity: "0",
  });
  document.body.appendChild(el);
  return el;
}

export class SvgParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SvgParseError";
  }
}

export function createPipelineContext(): PipelineContext {
  const sandbox = createSandbox();

  function parse(svg: string): SVGSVGElement {
    const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
    const parserError = doc.querySelector("parsererror");
    if (parserError) {
      throw new SvgParseError(
        parserError.textContent?.trim() || "Invalid SVG markup",
      );
    }
    const root = doc.documentElement;
    if (!root || root.tagName.toLowerCase() !== "svg") {
      throw new SvgParseError("Root element is not <svg>");
    }
    const imported = document.importNode(root, true) as unknown as SVGSVGElement;
    sandbox.appendChild(imported);
    return imported;
  }

  function serialize(el: SVGSVGElement): string {
    return new XMLSerializer().serializeToString(el);
  }

  function release(el: Element): void {
    if (el.parentNode === sandbox) {
      sandbox.removeChild(el);
    }
  }

  function dispose(): void {
    sandbox.replaceChildren();
  }

  return { sandbox, parse, serialize, release, dispose };
}
