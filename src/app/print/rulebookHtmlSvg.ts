import spiceMask from '../../../media/vector/icon/spice.svg?raw';

const tokenSymbols = import.meta.glob<string>(
  [
    '../../../media/vector/logo/*.svg',
    '../../../media/vector/generic/*.svg',
    '../../../media/vector/troop/*.svg',
    '../../../media/vector/troop_modifier/*.svg',
    '../../../media/vector/decal/combatwheel-multicolor.svg',
  ],
  { query: '?raw', import: 'default', eager: true }
);

/** Downloaded HTML cannot use remote SVG fragments, so trusted token symbols travel inside the document. */
export function rulebookHtmlSvg(markup: string, canonicalHref: string): string {
  const symbols = new Map<string, string>();
  /* CSS masks need embedded bytes: a downloaded file cannot fetch a root-relative or cross-origin mask. */
  const withLocalMasks = markup.replace(/<style\b[^>]*>[\s\S]*?<\/style>/g, (style) =>
    style.replace(
      /url\(\s*(["']?)\/vector\/icon\/spice\.svg\1\s*\)/g,
      () => `url("data:image/svg+xml,${encodeURIComponent(spiceMask)}")`
    )
  );
  const withLocalSymbols = withLocalMasks.replace(/<use\b[^>]*>/g, (use) =>
    use.replace(
      /(xlink:href|href)="(\/vector\/(?:logo|generic|troop|troop_modifier|decal)\/[^"#]+\.svg)#(root|star|outline)"/,
      (_, attribute, href, fragment) => {
        const id = `rulebook-token-${href.replace(/[^a-z0-9]/gi, '-')}`;
        if (!symbols.has(id)) {
          const svg = tokenSymbols[`../../../media${href}`];
          if (svg === undefined) {
            throw new Error('The selected game token symbol is not bundled.');
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
        return `${attribute}="#${id}-${fragment}"`;
      }
    )
  );
  const withAbsoluteImages = withLocalSymbols.replace(/<image\b[^>]*>/g, (image) =>
    image.replace(
      /(xlink:href|href)="(\/[^"#]+)"/,
      (_, attribute, href) =>
        `${attribute}="${new URL(href, canonicalHref).href.replaceAll('&', '&amp;').replaceAll('"', '&quot;')}"`
    )
  );
  if (symbols.size === 0) {
    return withAbsoluteImages;
  }
  const definitions = `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" aria-hidden="true" style="position:absolute"><defs>${[...symbols.values()].join('')}</defs></svg>`;
  return withAbsoluteImages.replace('<body>', `<body>${definitions}`);
}
