import { createStart } from '@tanstack/react-start';

/* Each public route opts in; authenticated routes never run their loaders on the server. */
export const startInstance = createStart(() => ({ defaultSsr: false }));
