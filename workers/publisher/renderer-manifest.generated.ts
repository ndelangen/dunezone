// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity:
    'faction-sheet/sha256:af0961a43381c778cffa7054ba0fe82d4ad48cd2cf3f58c670ec00270bd3898c',
  digest: 'af0961a43381c778cffa7054ba0fe82d4ad48cd2cf3f58c670ec00270bd3898c',
  components: {
    sources: '24da2ed4b7d14ce49e653876993b3c9e5401a688ead17c397da6378a9cc61365',
    toolchain: 'bab222d4229402776633d8e13227f0cffe4ac4f1c77bcfa04d4d19d55144e2aa',
    code: '9fe7574c99cde35fc158cb2c47bbe16e6874e926ae65c29dba5f86291973af85',
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
