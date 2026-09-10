declare module 'rulebook-html-renderer-runtime' {
  export const rulebookRendererCss: string;
  export function renderRulebookHtmlDocument(input: {
    canonicalHref: string;
    edition?: { rulebookId: string; editionNumber: number };
    document: unknown;
    label: string;
    style: string;
    title: string;
  }): string;
}
