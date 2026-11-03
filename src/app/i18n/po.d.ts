/* SPIKE (i18n option C): the Lingui Vite plugin compiles a PO catalogue when it is imported. */
declare module '*.po' {
  import type { Messages } from '@lingui/core';

  export const messages: Messages;
}
