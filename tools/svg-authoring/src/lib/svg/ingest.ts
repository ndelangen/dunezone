import { createSvgDocument, type SvgDocument } from "./types";

export async function readSvgFiles(files: FileList | File[]): Promise<SvgDocument[]> {
  const list = Array.from(files).filter(
    (f) => f.type === "image/svg+xml" || f.name.toLowerCase().endsWith(".svg"),
  );
  const docs = await Promise.all(
    list.map(async (file) => {
      const text = await file.text();
      return createSvgDocument(file.name, text);
    }),
  );
  return docs;
}

let pasteCounter = 0;

export function createDocFromPaste(source: string, name?: string): SvgDocument {
  pasteCounter += 1;
  return createSvgDocument(name ?? `pasted-${pasteCounter}.svg`, source.trim());
}

/** Quick structural check used before adding pasted content. */
export function looksLikeSvg(source: string): boolean {
  return /<svg[\s>]/i.test(source);
}
