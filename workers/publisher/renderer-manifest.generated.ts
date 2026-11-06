// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:0fb7a14279e26bcd8e1b3d4978cb5936402737a37ca6812d46541b57466996b4',
  digest: '0fb7a14279e26bcd8e1b3d4978cb5936402737a37ca6812d46541b57466996b4',
  components: {
    sources: 'e9e8629ba3528873454220933d50eee743c05e2f6e5b656dcca36fb926987fb5',
    toolchain: 'ee68c7d1edd23b07efa633f6c0b422fbcc5f4ad1006db6986d247b4c7eb9f68d',
    code: '9df367dbc32aac904bc2be6e5324ca5476a389603801512957aa7ff94e81ef76',
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
