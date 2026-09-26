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

  const hsp = Math.sqrt(0.199 * (r * r) + 0.587 * (g * g) + 0.114 * (b * b));

  return hsp > 157.5;
}
