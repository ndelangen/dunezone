/**
 * Whether white text on this colour falls below 3:1, the WCAG 2 contrast floor for large text.
 * White stays wherever it passes, and black text on a colour this light reaches at least 7:1.
 */
export function isLight(color: string) {
  let r = 0,
    g = 0,
    b = 0;

  if (color.match(/^rgb/)) {
    /* An rgb string the pattern cannot read keeps every channel at 0, so it reads as dark. */
    const channels = color.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*(\d+(?:\.\d+)?))?\)$/);
    if (channels) {
      r = Number(channels[1]);
      g = Number(channels[2]);
      b = Number(channels[3]);
    }
  } else {
    const out = +`0x${color.slice(1).replace(color.length < 5 ? /./g : '', '$&$&')}`;
    r = out >> 16;
    g = (out >> 8) & 255;
    b = out & 255;
  }

  const luminance = 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);

  /* WCAG 2 contrast ratio of white text on this colour. */
  return 1.05 / (luminance + 0.05) < 3;
}

/* Undoes the sRGB transfer curve, since WCAG 2 relative luminance sums linear light. */
function linear(channel: number) {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}
