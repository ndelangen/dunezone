import path from 'node:path';

import type * as Provision from '../provision';

const [provisionUrl, directory] = process.argv.slice(2);
const { configureLocalAuth, selfHostedEnvironment }: typeof Provision = await import(provisionUrl);
const deployment = {
  kind: 'self-hosted' as const,
  url: process.env.CONVEX_SELF_HOSTED_URL!,
  adminKey: process.env.CONVEX_SELF_HOSTED_ADMIN_KEY!,
};

configureLocalAuth(deployment, selfHostedEnvironment(process.env, deployment), {
  siteUrl: 'http://127.0.0.1:3000',
  artifactsDirectory: path.join(directory, 'auth'),
});
