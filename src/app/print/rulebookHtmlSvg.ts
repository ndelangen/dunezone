const tokenSymbols = import.meta.glob<string>(
  ['../../../media/vector/logo/*.svg', '../../../media/vector/generic/*.svg'],
  { query: '?raw', import: 'default', eager: true }
);

/** Downloaded HTML cannot use remote SVG fragments, so trusted token symbols travel inside the document. */
export function rulebookHtmlSvg(markup: string, canonicalHref: string): string {
  const symbols = new Map<string, string>();
  const withLocalSymbols = markup.replace(/<use\b[^>]*>/g, (use) =>
    use.replace(/(xlink:href|href)="(\/vector\/(?:logo|generic)\/[^"#]+\.svg)#root"/, (_, attribute, href) => {
      const id = `rulebook-token-${href.replace(/[^a-z0-9]/gi, '-')}`;
      if (!symbols.has(id)) {
        const svg = tokenSymbols[`../../../media${href}`];
        if (svg === undefined) {
          throw new Error('The selected faction token symbol is not bundled.');
        }
        const ids = new Map([...svg.matchAll(/\bid="([^"]+)"/g)].map((match) => [match[1], `${id}-${match[1]}`]));
        const symbol = svg
          .replace(/^<svg\b/, '<symbol')
          .replace(/<\/svg>\s*$/, '</symbol>')
          .replace(/(<symbol\b[^>]*?)\/>\s*$/, '$1></symbol>')
          .replace(/\bid="([^"]+)"/g, (_, original) => `id="${ids.get(original)}"`)
          .replace(
            /(\b(?:xlink:href|href)="#|url\(#)([^"\s)]+)/g,
            (_, prefix, original) => `${prefix}${ids.get(original) ?? original}`
          );
        symbols.set(id, symbol);
      }
      return `${attribute}="#${id}-root"`;
    })
  );
  const withAbsoluteImages = withLocalSymbols.replace(/<image\b[^>]*>/g, (image) =>
    image.replace(
      /(xlink:href|href)="(\/[^"#]+)"/,
      (_, attribute, href) =>
        `${attribute}="${new URL(href, canonicalHref).href.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`
    )
  );
  if (symbols.size === 0) {
    return withAbsoluteImages;
  }
  const definitions = `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" aria-hidden="true" style="position:absolute"><defs>${[...symbols.values()].join('')}</defs></svg>`;
  return withAbsoluteImages.replace('<body>', `<body>${definitions}`);
}
