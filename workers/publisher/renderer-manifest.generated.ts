// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:c0393543b39bb529dc75f7165346e92f52cbcb0da58dd443e145730f27214e54',
  digest: 'c0393543b39bb529dc75f7165346e92f52cbcb0da58dd443e145730f27214e54',
  components: {
    sources: '1b7d22a71842774672af2906210f39ee37cfa2fc2e5a106c2fcd99806c247303',
    toolchain: 'e048162bc6b4c6d2410ca1b50b5c3a886c584aeeabbcd6f5725a86068621e1c6',
    code: 'e7d5e9257ed6f4b4368071e1935894c70be5ece631f64ea0b8896b79bf355c63',
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
