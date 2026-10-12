// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:c74d5bcf168f0a10c3c95173db0c8de52c3d292e8b1b6e9da4671adde8eeb826',
  digest: 'c74d5bcf168f0a10c3c95173db0c8de52c3d292e8b1b6e9da4671adde8eeb826',
  components: {
    sources: 'a00fae12aeb5e2da0202de0ad3bf2675381eadf24de4fca2a055197637d4435d',
    toolchain: 'f3a1b265a116b4fd4fe11cf401918ef561a9d8c134cb9ce21267698147960224',
    code: 'b1feb55ba9e8515c448447d3bf0b6507b7aae5ae109ad3695e0a1ba907b335fa',
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
