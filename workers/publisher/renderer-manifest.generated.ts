// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:2df9e2bedc993cdea075620121786ae8e3fd9461f2ecb12cc6c413c32cfd27bb',
  digest: '2df9e2bedc993cdea075620121786ae8e3fd9461f2ecb12cc6c413c32cfd27bb',
  components: {
    sources: '3464079df50b1134b687a2aa4923d75f357488780e041b3763a9197fce0a17c3',
    toolchain: 'df38b3277de26c074c7b12763e5a5817e5c08c6940bd94f4e1e5c531dcf21b5b',
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
