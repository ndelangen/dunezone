export const card: Size = {
  width: 900,
  height: 1263,
};

export const disc: Size = {
  width: 600,
  height: 600,
};

/**
 * A rectangle token, at the same 600 unit width as `disc` so the two token shapes print at a comparable physical size.
 * 372 keeps the 0.62 the catalogue reserves for this shape, and it is exactly twice the renderer's 300 by 186 face units.
 */
export const tokenRectangle: Size = {
  width: 600,
  height: 372,
};

export const shield: Size = {
  width: 3216 / 2,
  height: 1610 / 2,
};

export const page: Size = {
  width: 700,
  height: 700 * Math.sqrt(2),
};

interface Size {
  width: number;
  height: number;
}
