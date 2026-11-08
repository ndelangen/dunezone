import type { PluginOption } from 'vite-plus';

/*
 * Vite's build report, which vite-plus logs as one message whose first line is an emitted file and its size, such as `dist/client/index.html  0.17 kB`.
 * If a later Vite logs it differently, the regex stops matching and the report prints again.
 */
const BUILD_REPORT_FILE_LINE = /^\S*dist\/\S+\s+[\d,.]+ kB/u;

/**
 * In CI, Vite's report of every emitted file (about 1,400 lines per app build) is left out of the log.
 * The bundle budgets still print and fail on any oversized client chunk, and the build's `dist/` holds the files.
 * Their gzip sizes are then never shown, so a config using this sets `reportCompressedSize: !process.env.CI` to skip computing them too.
 */
export function quietBuildReportInCi(): PluginOption {
  return {
    name: 'dunezone:quiet-build-report-in-ci',
    apply: () => Boolean(process.env.CI),
    configResolved(config) {
      const passThrough = config.logger.info.bind(config.logger);
      config.logger.info = (message, options) => {
        if (BUILD_REPORT_FILE_LINE.test(message.trim())) {
          return;
        }
        passThrough(message, options);
      };
    },
  };
}
