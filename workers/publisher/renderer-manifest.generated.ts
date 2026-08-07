// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity:
    'faction-sheet/sha256:c9efeef7fac44e992ce33968542a974f054d4ebde3fc876c13c15399000aa9c1',
  digest: 'c9efeef7fac44e992ce33968542a974f054d4ebde3fc876c13c15399000aa9c1',
  components: {
    sources: '24da2ed4b7d14ce49e653876993b3c9e5401a688ead17c397da6378a9cc61365',
    toolchain: 'bab222d4229402776633d8e13227f0cffe4ac4f1c77bcfa04d4d19d55144e2aa',
    code: 'da94a5a355d27941aaf239e46ab53793ca7c3a07952123c092cfedfe4d047f13',
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
