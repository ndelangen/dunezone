export function clampInfluence(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function influenceToSliderPosition(storedValue: number): number {
  return (1 - Math.sqrt(1 - clampInfluence(storedValue))) * 100;
}

export function sliderPositionToInfluence(position: number): number {
  const normalized = clampInfluence(position / 100);
  return Number((1 - (1 - normalized) ** 2).toFixed(4));
}
