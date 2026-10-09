import type { PDFDocument, PDFObject } from 'pdf-lib';
import { PDFArray, PDFDict, PDFName, PDFRawStream, PDFRef } from 'pdf-lib';

import { binaryBytes, contentTokens, decodedContent, digest } from './content';

function rewriteReferences(document: PDFDocument, replacements: Map<PDFRef, PDFRef>) {
  const visited = new Set<PDFObject>();
  function visit(object: PDFObject) {
    if (visited.has(object)) {
      return;
    }
    visited.add(object);
    if (object instanceof PDFRawStream) {
      visit(object.dict);
    } else if (object instanceof PDFDict) {
      for (const [key, value] of object.entries()) {
        if (value instanceof PDFRef) {
          object.set(key, replacements.get(value) ?? value);
        } else {
          visit(value);
        }
      }
    } else if (object instanceof PDFArray) {
      for (let index = 0; index < object.size(); index += 1) {
        const value = object.get(index);
        if (value instanceof PDFRef) {
          object.set(index, replacements.get(value) ?? value);
        } else {
          visit(value);
        }
      }
    }
  }
  for (const [, object] of document.context.enumerateIndirectObjects()) {
    visit(object);
  }
  const trailer = document.context.trailerInfo;
  for (const key of ['Root', 'Encrypt', 'Info', 'ID'] as const) {
    const value = trailer[key];
    if (value instanceof PDFRef) {
      trailer[key] = replacements.get(value) ?? value;
    } else if (value) {
      visit(value);
    }
  }
}

/** Shares byte-identical resources; tagged Forms retain their own structure-tree identity. */
export async function shareImages(document: PDFDocument): Promise<void> {
  const seen = new Map<string, PDFRef>();
  const replacements = new Map<PDFRef, PDFRef>();
  for (const [ref, object] of document.context.enumerateIndirectObjects()) {
    if (
      !(object instanceof PDFRawStream) ||
      object.dict.has(PDFName.of('StructParent')) ||
      object.dict.has(PDFName.of('StructParents'))
    ) {
      continue;
    }
    const subtype = object.dict.get(PDFName.of('Subtype'));
    if (subtype !== PDFName.of('Image') && subtype !== PDFName.of('Form')) {
      continue;
    }
    if (
      subtype === PDFName.of('Form') &&
      contentTokens(decodedContent(object)).some(({ value }) => value === 'BDC' || value === 'BMC')
    ) {
      continue;
    }
    const dictionary = object.dict
      .entries()
      .filter(([key]) => key !== PDFName.Length)
      .map(([key, value]) => `${key} ${value}`)
      .sort()
      .join('\n');
    const signature = (await digest(Uint8Array.from(object.contents))) + (await digest(binaryBytes(dictionary)));
    const previous = seen.get(signature);
    if (previous) {
      replacements.set(ref, previous);
    } else {
      seen.set(signature, ref);
    }
  }
  rewriteReferences(document, replacements);
}

/** Removes unreachable objects and numbers the retained graph densely for a complete classic xref. */
export function compactObjects(document: PDFDocument): void {
  const reachable = new Set<PDFRef>();
  const visited = new Set<PDFObject>();
  function visit(object: PDFObject | undefined) {
    if (!object || visited.has(object)) {
      return;
    }
    visited.add(object);
    if (object instanceof PDFRef) {
      reachable.add(object);
      const target = document.context.lookup(object);
      if (!target) {
        throw new Error(`PDF contains a dangling reference: ${object}`);
      }
      visit(target);
    } else if (object instanceof PDFRawStream) {
      visit(object.dict);
    } else if (object instanceof PDFDict) {
      for (const [, value] of object.entries()) {
        visit(value);
      }
    } else if (object instanceof PDFArray) {
      for (const value of object.asArray()) {
        visit(value);
      }
    }
  }
  for (const value of Object.values(document.context.trailerInfo)) {
    visit(value);
  }
  const objects = document.context.enumerateIndirectObjects();
  const retained = objects.filter(([ref]) => reachable.has(ref));
  const replacements = new Map(retained.map(([ref], index) => [ref, PDFRef.of(index + 1)]));
  rewriteReferences(document, replacements);
  for (const [ref] of objects) {
    document.context.delete(ref);
  }
  document.context.largestObjectNumber = 0;
  for (const [ref, object] of retained) {
    document.context.assign(replacements.get(ref)!, object);
  }
}
