import Discord from '@auth/core/providers/discord';
import Google from '@auth/core/providers/google';
import { Password } from '@convex-dev/auth/providers/Password';
import { convexAuth } from '@convex-dev/auth/server';

import { applicationTriggers } from './lib/applicationTriggers';
import { ensureProfileForUser, profileSourcesFromUserDoc } from './lib/profileBootstrap';

const gemini = 'https://www.googleapis.com/auth/generative-language.retriever';
const localE2eAuthEnabled = process.env.E2E_LOCAL_AUTH === 'true';

function decodeBase64Ascii(value: string): string {
  const atobFn = (globalThis as { atob?: (input: string) => string }).atob;
  if (typeof atobFn === 'function') {
    return atobFn(value);
  }
  const BufferCtor = (
    globalThis as {
      Buffer?: { from: (input: string, encoding: string) => { toString: (enc: string) => string } };
    }
  ).Buffer;
  if (BufferCtor?.from) {
    return BufferCtor.from(value, 'base64').toString('utf8');
  }
  throw new Error('No base64 decoder available in runtime');
}

function decodeEnvFromBase64(targetKey: string, base64Key: string) {
  const current = process.env[targetKey];
  const encoded = process.env[base64Key];
  if (current || !encoded) {
    return;
  }
  try {
    process.env[targetKey] = decodeBase64Ascii(encoded);
  } catch (error) {
    throw new Error(`Failed to decode ${base64Key}: ${error instanceof Error ? error.message : 'unknown error'}`);
  }
}

decodeEnvFromBase64('JWT_PRIVATE_KEY', 'JWT_PRIVATE_KEY_B64');
decodeEnvFromBase64('JWKS', 'JWKS_B64');

const providers: Parameters<typeof convexAuth>[0]['providers'] = [];

if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  providers.push(
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      authorization: {
        params: {
          scope: `openid profile ${gemini}`,
        },
      },
    })
  );
}

if (process.env.AUTH_DISCORD_ID && process.env.AUTH_DISCORD_SECRET) {
  providers.push(
    Discord({
      clientId: process.env.AUTH_DISCORD_ID,
      clientSecret: process.env.AUTH_DISCORD_SECRET,
      authorization: {
        url: 'https://discord.com/api/oauth2/authorize',
        params: { scope: 'identify' },
      },
    })
  );
}

if (localE2eAuthEnabled) {
  providers.push(Password);
}

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers,
  callbacks: {
    async redirect({ redirectTo }) {
      const siteUrl = process.env.SITE_URL;
      if (!siteUrl) {
        return redirectTo.startsWith('/') ? redirectTo : '/';
      }

      if (redirectTo.startsWith('/')) {
        return new URL(redirectTo, siteUrl).toString();
      }

      if (redirectTo.startsWith(siteUrl)) {
        return redirectTo;
      }

      return siteUrl;
    },
    async afterUserCreatedOrUpdated(ctx, { userId }) {
      const triggerCtx = applicationTriggers.wrapDB(ctx);
      const user = await triggerCtx.db.get(userId);
      if (!user) {
        return;
      }
      await ensureProfileForUser(triggerCtx, userId, profileSourcesFromUserDoc(user));
    },
  },
});
