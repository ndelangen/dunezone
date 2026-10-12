/** The publisher supplies artifact delivery inside the current server request, avoiding a public self-fetch. */
export type RulebookReaderRequestContext = {
  publishedRulebookFetch?: (href: string) => Promise<Response>;
};
