// Generated after assembling the complete publisher Static Assets release.
// Run `bun run publisher:assets` after changing Renderer assets or the PDF contract.
// Generated images are identified by ingredients (media/ + rules + generator +
// sharp version), so this file is reproducible on any machine (wayfinder #269).
export const rendererManifest = {
  schemaVersion: 2,
  rendererIdentity: 'faction-sheet/sha256:a88742b2c6f18dda86deceddc8ef881ad12cedf92fe794634cdb8df6b6880d31',
  digest: 'a88742b2c6f18dda86deceddc8ef881ad12cedf92fe794634cdb8df6b6880d31',
  components: {
    sources: '43dc6dc26a352422bba98bdddf7b25c194fc72c30b968f6dad37a51ea7053b1d',
    toolchain: 'ee68c7d1edd23b07efa633f6c0b422fbcc5f4ad1006db6986d247b4c7eb9f68d',
    code: '6da47ac2d95630e737ee61d440d9f798aa8514b4ad74c8f08a92a97e51ce20f9',
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
