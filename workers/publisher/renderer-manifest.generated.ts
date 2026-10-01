// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:9a3a148df88ad1b49af2335f39eef1c1fe395491d9ad341b1f7e0d80232b2cda',
  digest: '9a3a148df88ad1b49af2335f39eef1c1fe395491d9ad341b1f7e0d80232b2cda',
  components: {
    sources: '6d2b9122f189bc5e3107f8b7e5dde3323ca5d854cbf33af7168d0bbcb951ac61',
    toolchain: '500ae6945bd2172157069a70a88b1f7f4f0ed4cb8081056fab0dbd976c7e6ddb',
    code: '03bc73ef91b07800e08ffb80c6d1d51f7616f989eca3061f3d7d516f8eb23813',
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
