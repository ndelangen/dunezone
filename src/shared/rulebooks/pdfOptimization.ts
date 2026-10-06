/** Bounds apply to one frozen Rulebook capture, not to card or faction sheet captures. */
export const RULEBOOK_PDF_MAX_PAGES = 100;
export const RULEBOOK_PDF_RAW_MAX_BYTES = 96 * 1024 * 1024;
export const RULEBOOK_PDF_TRANSFER_BYTES = 512 * 1024;
export const RULEBOOK_PDF_CAPTURE_TIMEOUT_MS = 180_000;

export type RulebookPdfOptimizer = {
  append: (offset: number, base64: string) => void;
  finish: (pageCount: number) => Promise<{ bytes: number; pages: number }>;
  read: (offset: number) => string;
};

declare global {
  var rulebookPdfOptimizer: RulebookPdfOptimizer | undefined;
}
