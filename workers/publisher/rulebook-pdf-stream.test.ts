import { Buffer } from 'node:buffer';

import type { BrowserContext, Page } from '@cloudflare/playwright';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { RULEBOOK_PDF_TRANSFER_BYTES } from '../../src/shared/rulebooks/pdfOptimization';
import { captureCompressedRulebookPdf } from './rulebook-pdf-stream';

function capture(input: Uint8Array, output: Uint8Array) {
  let offset = 0;
  const chunks: { offset: number; length: number }[] = [];
  globalThis.rulebookPdfOptimizer = {
    append: (offset, base64) => chunks.push({ offset, length: Buffer.from(base64, 'base64').length }),
    finish: async (pages) => ({ pages, bytes: output.length }),
    read: (offset) => Buffer.from(output.subarray(offset, offset + RULEBOOK_PDF_TRANSFER_BYTES)).toString('base64'),
  };
  const send = vi.fn(async (command: string) => {
    if (command === 'Page.printToPDF') {
      return { stream: 'raw-pdf' };
    }
    if (command === 'IO.read') {
      const data = input.subarray(offset, offset + RULEBOOK_PDF_TRANSFER_BYTES);
      offset += data.length;
      return { data: Buffer.from(data).toString('base64'), base64Encoded: true, eof: offset === input.length };
    }
    return {};
  });
  const detach = vi.fn(async () => {});
  const context = { newCDPSession: async () => ({ send, detach }) } as unknown as BrowserContext;
  const page = {
    emulateMedia: async () => {},
    evaluate: async (callback: (argument: unknown) => unknown, argument: unknown) => await callback(argument),
  } as unknown as Page;
  return { context, page, send, detach, chunks };
}

afterEach(() => {
  globalThis.rulebookPdfOptimizer = undefined;
});

describe('Rulebook PDF streaming', () => {
  test('transfers ordered bounded chunks and closes the raw stream before compression', async () => {
    const input = new Uint8Array(RULEBOOK_PDF_TRANSFER_BYTES * 2 + 7).fill(17);
    const output = new Uint8Array(RULEBOOK_PDF_TRANSFER_BYTES + 3).fill(29);
    const fixture = capture(input, output);
    expect(
      await captureCompressedRulebookPdf(fixture.context, fixture.page, 'tall', 82, performance.now() + 10_000)
    ).toEqual(output);
    expect(fixture.chunks).toEqual([
      { offset: 0, length: RULEBOOK_PDF_TRANSFER_BYTES },
      { offset: RULEBOOK_PDF_TRANSFER_BYTES, length: RULEBOOK_PDF_TRANSFER_BYTES },
      { offset: RULEBOOK_PDF_TRANSFER_BYTES * 2, length: 7 },
    ]);
    expect(fixture.send).toHaveBeenCalledWith(
      'Page.printToPDF',
      expect.objectContaining({ transferMode: 'ReturnAsStream', paperWidth: 105 / 25.4, paperHeight: 297 / 25.4 })
    );
    expect(fixture.send).toHaveBeenLastCalledWith('IO.close', { handle: 'raw-pdf' });
    expect(fixture.detach).toHaveBeenCalledOnce();
  });

  test('closes the stream when an input chunk is rejected', async () => {
    const fixture = capture(new Uint8Array([1]), new Uint8Array([2]));
    globalThis.rulebookPdfOptimizer!.append = () => {
      throw new Error('Rejected input');
    };
    await expect(
      captureCompressedRulebookPdf(fixture.context, fixture.page, 'square', 1, performance.now() + 10_000)
    ).rejects.toThrow('Rejected input');
    expect(fixture.send).toHaveBeenLastCalledWith('IO.close', { handle: 'raw-pdf' });
    expect(fixture.detach).toHaveBeenCalledOnce();
  });

  test('rejects truncated optimized output', async () => {
    const fixture = capture(new Uint8Array([1]), new Uint8Array([2]));
    globalThis.rulebookPdfOptimizer!.read = () => '';
    await expect(
      captureCompressedRulebookPdf(fixture.context, fixture.page, 'square', 1, performance.now() + 10_000)
    ).rejects.toThrow('truncated');
    expect(fixture.detach).toHaveBeenCalledOnce();
  });
});
