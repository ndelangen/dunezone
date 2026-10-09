export type Matrix = [number, number, number, number, number, number];
export const identity: Matrix = [1, 0, 0, 1, 0, 0];

export function multiply(left: Matrix, right: Matrix): Matrix {
  return [
    left[0] * right[0] + left[2] * right[1],
    left[1] * right[0] + left[3] * right[1],
    left[0] * right[2] + left[2] * right[3],
    left[1] * right[2] + left[3] * right[3],
    left[0] * right[4] + left[2] * right[5] + left[4],
    left[1] * right[4] + left[3] * right[5] + left[5],
  ];
}

export function matrix(values: unknown[]): Matrix {
  if (values.length !== 6 || values.some((value) => typeof value !== 'number' || !Number.isFinite(value))) {
    throw new Error('PDF has an invalid transformation matrix');
  }
  return values as Matrix;
}

/** Covers the entire visible page in the drawing's inherited coordinate system. */
export function drawingBounds(
  box: { x: number; y: number; width: number; height: number },
  transform: Matrix
): number[] | undefined {
  const [a, b, c, d, e, f] = transform;
  const determinant = a * d - b * c;
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-12) {
    return;
  }
  const xs: number[] = [];
  const ys: number[] = [];
  for (const x of [box.x, box.x + box.width]) {
    for (const y of [box.y, box.y + box.height]) {
      xs.push((d * (x - e) - c * (y - f)) / determinant);
      ys.push((-b * (x - e) + a * (y - f)) / determinant);
    }
  }
  if ([...xs, ...ys].some((value) => !Number.isFinite(value))) {
    return;
  }
  return [Math.min(...xs) - 1, Math.min(...ys) - 1, Math.max(...xs) + 1, Math.max(...ys) + 1];
}
