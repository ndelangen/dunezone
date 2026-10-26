import { z } from 'zod';

export const BUG_REPORT_LABEL = 'reported-bug';
export const BUG_REPORT_REPOSITORY = 'ndelangen/dunezone';
export const bugReportIdSchema = z.uuid();
export const bugReportDescriptionSchema = z.strictObject({
  description: z.string().trim().min(1, 'Describe what went wrong.').max(8000),
});
export const bugReportDiagnosticsSchema = z.strictObject({
  clientRevision: z.number().int().nonnegative(),
  connection: z
    .enum(['connecting', 'authorized', 'suspended', 'reconnecting', 'denied', 'offline', 'closed'])
    .catch('offline'),
  viewport: z.tuple([z.number().int().min(0).max(32_768), z.number().int().min(0).max(32_768)]),
  pixelRatio: z.number().min(0).max(16),
  language: z.string().max(80),
  userAgent: z.string().max(1024),
  online: z.boolean(),
});
export const bugReportBrowserSchema = z.strictObject({
  snapshot: z.json(),
  conversations: z.json(),
  logs: z
    .array(
      z.strictObject({
        at: z.string().max(40),
        level: z.enum([
          'log',
          'info',
          'warn',
          'error',
          'debug',
          'trace',
          'console',
          'uncaught',
          'unhandledrejection',
          'resource',
        ]),
        text: z.string().max(8192),
      })
    )
    .max(500),
  droppedLogs: z.number().int().nonnegative(),
  diagnostics: bugReportDiagnosticsSchema,
});
export const bugReportRequestSchema = z.discriminatedUnion('operation', [
  bugReportDescriptionSchema.extend({
    operation: z.literal('send'),
    requestId: bugReportIdSchema,
    pass: z.string().min(1).max(4096),
    browser: bugReportBrowserSchema,
  }),
  z.strictObject({ operation: z.literal('status'), requestId: bugReportIdSchema, pass: z.string().min(1).max(4096) }),
]);
export const bugReportProgressSchema = z.strictObject({
  requestId: bugReportIdSchema,
  stage: z.enum(['collecting', 'creating', 'complete', 'failed', 'uncertain']),
  issueUrl: z
    .string()
    .regex(/^https:\/\/github\.com\/ndelangen\/dunezone\/issues\/\d+$/u)
    .optional(),
  message: z.string().max(600).optional(),
});
export type BugReportDescription = z.infer<typeof bugReportDescriptionSchema>;
export type BugReportDiagnostics = z.infer<typeof bugReportDiagnosticsSchema>;
export type BugReportBrowser = z.infer<typeof bugReportBrowserSchema>;
export type BugReportRequest = z.infer<typeof bugReportRequestSchema>;
export type BugReportProgress = z.infer<typeof bugReportProgressSchema>;

export const BUG_REPORT_DISCLOSURE =
  'This public GitHub issue includes the full game state, including all hidden cards, deck order, predictions and battle plans, plus your browser state, logs and errors. The Game log records this export. Chat messages are replaced by their original length. Sign-in credentials are excluded.';
