/* The table's lettering face, shared by the widget's labels and anything else painted onto the table. */
import tableLabelFontUrl from './assets/desdemona-black-regular.woff?url';

export const TABLE_LABEL_FONT_FAMILY = 'Dune Play Table Label';
export const FALLBACK_FONT_FAMILY = 'Georgia, serif';

let tableLabelFontPromise: Promise<boolean> | undefined;

export function loadTableLabelFont(): Promise<boolean> {
  if (tableLabelFontPromise) {
    return tableLabelFontPromise;
  }

  if (typeof document === 'undefined' || typeof FontFace === 'undefined') {
    return Promise.resolve(false);
  }
  if (!document.fonts) {
    return Promise.resolve(false);
  }

  tableLabelFontPromise = new FontFace(TABLE_LABEL_FONT_FAMILY, `url("${tableLabelFontUrl}")`)
    .load()
    .then((fontFace) => {
      document.fonts.add(fontFace);
      return true;
    })
    .catch(() => false);

  return tableLabelFontPromise;
}
