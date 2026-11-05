// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:284ecc979406a90af0fc93536d382fdabce5ee24db02192a6fca66a8a14d5027',
  digest: '284ecc979406a90af0fc93536d382fdabce5ee24db02192a6fca66a8a14d5027',
  components: {
    sources: '43dc6dc26a352422bba98bdddf7b25c194fc72c30b968f6dad37a51ea7053b1d',
    toolchain: 'ee68c7d1edd23b07efa633f6c0b422fbcc5f4ad1006db6986d247b4c7eb9f68d',
    code: 'e8afbab4ef754f54075dcf2f74b3880080aadc027caabe3e85c64cfbcc9158b5',
    contract: '2920714c87493d104342355dda2b956202259513c78ce6195670034f31a656a6',
  },
  contract: {
    viewport: {
      width: 2100,
      height: 2970,
      deviceScaleFactor: 1,
    },
    pdf: {
      pageCount: 2,
      pageWidthMm: 210,
      pageHeightMm: 297,
      pageSizeToleranceMm: 0.5,
      displayHeaderFooter: false,
      marginMm: {
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
      },
      preferCssPageSize: true,
      printBackground: true,
    },
  },
} as const;
