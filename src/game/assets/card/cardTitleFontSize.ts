/* Conservative Copperplate width estimates in em units keep sizing independent of font loading. */
export function cardTitleFontSize(name: string, width = 560) {
  const estimatedWidth = Array.from(name).reduce((width, character) => {
    if (/[MW]/.test(character)) {
      return width + 1.2;
    }
    if (/[A-Z]/.test(character)) {
      return width + 0.95;
    }
    if (/[mw]/.test(character)) {
      return width + 0.9;
    }
    if (/[il]/.test(character)) {
      return width + 0.4;
    }
    if (/\s/.test(character)) {
      return width + 0.35;
    }
    return width + (character.codePointAt(0)! > 255 ? 1.2 : 0.7);
  }, 0);
  return Math.min(60, width / Math.max(1, estimatedWidth));
}
