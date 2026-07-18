const encoder = new TextEncoder();

function byteLength(value: string): number {
  return encoder.encode(value).byteLength;
}

function xrefOffset(offset: number): string {
  return String(offset).padStart(10, '0');
}

/** A repairable two-page PDF whose classic xref intentionally omits objects 2-4. */
export function incompleteClassicXrefPdf(): Uint8Array {
  let source = '%PDF-1.7\n';
  const catalogOffset = byteLength(source);
  source += '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n';
  source += '2 0 obj\n<< /Type /Pages /Count 2 /Kids [3 0 R 4 0 R] >>\nendobj\n';
  source +=
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 425.19685 552.75591] >>\nendobj\n';
  source +=
    '4 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 425.19685 552.75591] >>\nendobj\n';
  const classicXrefOffset = byteLength(source);
  source += 'xref\n';
  source += '0 2\n';
  source += '0000000000 65535 f \n';
  source += `${xrefOffset(catalogOffset)} 00000 n \n`;
  source += 'trailer\n';
  source += '<< /Size 5 /Root 1 0 R >>\n';
  source += 'startxref\n';
  source += `${classicXrefOffset}\n`;
  source += '%%EOF\n';
  return encoder.encode(source);
}
