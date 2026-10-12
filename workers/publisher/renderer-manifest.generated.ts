// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:92219428148e5dc47d6d7e02bdccee6c78171bae7c9e6ba55c544d4438b4ad0f',
  digest: '92219428148e5dc47d6d7e02bdccee6c78171bae7c9e6ba55c544d4438b4ad0f',
  components: {
    sources: '49e03f0177e8a60f7205aa511ef5c9eae1ffd365ff3c60ee66d0bba34083e725',
    toolchain: '158973671a68e7039b92c27cf708305c9a889bb507b12c8ab580a168d6aca389',
    code: '75810447b53b95876c08de7c589e10cf943a54ef70958db2ac57e0762cc11350',
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
