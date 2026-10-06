import type { PDFDocument } from 'pdf-lib';
import { PDFArray, PDFRawStream, decodePDFRawStream } from 'pdf-lib';

export type Token = { value: string; start: number; end: number };

export function binaryText(bytes: Uint8Array): string {
  let text = '';
  for (let offset = 0; offset < bytes.length; offset += 32_768) {
    text += String.fromCharCode(...bytes.subarray(offset, offset + 32_768));
  }
  return text;
}

export function binaryBytes(text: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(text, (character) => character.charCodeAt(0));
}

/** Reads PDF tokens without interpreting operators inside strings, names, or comments. */
export function contentTokens(text: string): Token[] {
  const tokens: Token[] = [];
  let position = 0;
  while (position < text.length) {
    const start = position;
    const character = text[position];
    if (/\s/.test(character)) {
      position += 1;
      continue;
    }
    if (character === '%') {
      const end = text.slice(position).search(/[\r\n]/);
      position = end < 0 ? text.length : position + end + 1;
      continue;
    }
    if (character === '(') {
      let depth = 1;
      position += 1;
      while (position < text.length && depth) {
        if (text[position] === '\\') {
          position += 2;
        } else {
          if (text[position] === '(') {
            depth += 1;
          }
          if (text[position] === ')') {
            depth -= 1;
          }
          position += 1;
        }
      }
      if (depth) {
        throw new Error('PDF contains an unclosed string');
      }
      tokens.push({ value: '(string)', start, end: position });
      continue;
    }
    if (character === '<' && text[position + 1] !== '<') {
      const end = text.indexOf('>', position + 1);
      if (end < 0) {
        throw new Error('PDF contains an unclosed hex string');
      }
      position = end + 1;
      tokens.push({ value: '(string)', start, end: position });
      continue;
    }
    const match = /^\/?[^\s[\]()<>/{}%]+/.exec(text.slice(position));
    const value = match?.[0] ?? character;
    position += value.length;
    tokens.push({ value, start, end: position });
  }
  return tokens;
}

export function decodedContent(stream: PDFRawStream): string {
  return binaryText(decodePDFRawStream(stream).decode());
}

export function pageContent(document: PDFDocument, index: number): string {
  const content = document.getPage(index).node.Contents();
  if (!content) {
    return '';
  }
  const streams =
    content instanceof PDFArray ? content.asArray().map((ref) => document.context.lookup(ref)) : [content];
  return streams
    .map((stream) => {
      if (!(stream instanceof PDFRawStream)) {
        throw new Error('PDF page has no readable content stream');
      }
      return decodedContent(stream);
    })
    .join('\n');
}

export async function deflate(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function digest(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(hash, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
