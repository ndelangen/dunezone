// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:ab6b2fb39235b97752ab82ed387f3926fd0c214b8e05642bf2797e6d7736ea16',
  digest: 'ab6b2fb39235b97752ab82ed387f3926fd0c214b8e05642bf2797e6d7736ea16',
  components: {
    sources: '49e03f0177e8a60f7205aa511ef5c9eae1ffd365ff3c60ee66d0bba34083e725',
    toolchain: '5d401ba4ca8b8b60046ca2de4aa9d79daa8fdf49a588b3d23b5f7a3fdcf204c5',
    code: 'e22b3d5e8090ebf03a1d93f766ad7032472d98101bded5dbb73f2d416960d5ab',
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
