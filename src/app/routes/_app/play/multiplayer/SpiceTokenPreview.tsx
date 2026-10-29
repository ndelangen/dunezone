import { gameAssetColors } from '@shared/play/assetColors';

/** The reserve's selected amount, shown both before pickup and at its proposed table position. */
export function SpiceTokenPreview({ amount }: Readonly<{ amount: number }>) {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden>
      <circle cx="32" cy="33" r="28" fill={gameAssetColors.spiceStack} />
      <circle
        cx="32"
        cy="29"
        r="26"
        fill={gameAssetColors.spiceFallbackFace}
        stroke={gameAssetColors.spiceIcon}
        strokeWidth="2"
      />
      <image href="/vector/icon/spice.svg" x="20" y="6" width="24" height="24" />
      <text x="32" y="48" textAnchor="middle" fill={gameAssetColors.spiceIcon} fontSize="22" fontWeight="700">
        {amount}
      </text>
    </svg>
  );
}
