// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:912a7f069f8d7d2a803796b3b09f1756453a5f65afb9d3eabb74b094dcb5d4a9',
  digest: '912a7f069f8d7d2a803796b3b09f1756453a5f65afb9d3eabb74b094dcb5d4a9',
  components: {
    sources: '72577dd6d22f29359f382d5d5c8bc00cd9de596ad652c317b5b6423043ee0478',
    toolchain: '16c805c7c848647a49cede4b962435ec093b4d311f7d7e57baaf6adc7efad6a5',
    code: 'fb0838b4ca3a22fe2ffa966d799607f6ef8e1fc69bccf1949abaab0a4e66601d',
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
