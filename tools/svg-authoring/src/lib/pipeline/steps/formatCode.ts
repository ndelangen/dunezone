import type { SvgDocument } from "../../svg/types";
import type { PipelineContext } from "../context";
import type { PipelineStep } from "../step";

export interface FormatConfig {
  /** Number of spaces per indent level. */
  indent: number;
}

/**
 * Pretty-print serialized SVG markup. Most pipeline steps emit a single line
 * via XMLSerializer; this re-indents the document so it is human-readable.
 * Text content between tags is preserved (only whitespace-only gaps between
 * adjacent tags is reformatted).
 */
export function formatSvg(svg: string, indentSize = 2): string {
  const pad = " ".repeat(Math.max(0, indentSize));
  const normalized = svg
    .replace(/\r?\n/g, "")
    // split between tags that have only whitespace between them
    .replace(/>\s+</g, "><")
    .replace(/></g, ">\n<");

  const lines = normalized.split("\n");
  const out: string[] = [];
  let depth = 0;

  for (const raw of lines) {
    const token = raw.trim();
    if (!token) continue;

    const isClosing = /^<\//.test(token);
    const isDeclaration = /^<[?!]/.test(token); // <?xml ...?>, <!-- -->, <!DOCTYPE>
    const isSelfClosing = /\/>$/.test(token);
    const isOpening = /^<[a-zA-Z]/.test(token) && !isSelfClosing;
    // e.g. <title>Hello</title> kept on one line — no net depth change.
    const hasInlineClose = isOpening && /<\/[^>]+>\s*$/.test(token);

    if (isClosing) depth = Math.max(0, depth - 1);
    out.push(pad.repeat(depth) + token);
    if (isOpening && !hasInlineClose && !isDeclaration) depth++;
  }

  return out.join("\n");
}

export const formatCode: PipelineStep<FormatConfig> = {
  id: "formatCode",
  label: "Format SVG code",
  description: "Pretty-print the markup with indentation (undo one-line output).",
  defaultConfig: { indent: 2 },

  run(docs: SvgDocument[], config: FormatConfig, ctx: PipelineContext) {
    const indent = Number.isFinite(config.indent) ? config.indent : 2;
    return docs.map((doc) => {
      try {
        // Normalize through the parser first so the input is consistent markup.
        const el = ctx.parse(doc.current);
        const serialized = ctx.serialize(el);
        ctx.release(el);
        return { ...doc, current: formatSvg(serialized, indent) };
      } catch {
        return { ...doc, current: formatSvg(doc.current, indent) };
      }
    });
  },
};
