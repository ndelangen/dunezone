import { v } from 'convex/values';

import { verifySeatPass } from '../src/shared/play/seatPass';
import { publicQuery } from './functions';
import { authenticatedPlayGame, admitsPlayers, playSessionAuthorization } from './lib/playAuthorization';

/** Checks a game-scoped pass against the current session without storing a report or extending the session. */
export const authorize = publicQuery({
  args: { gameId: v.string(), secret: v.string(), pass: v.string() },
  returns: v.union(v.null(), v.object({ authExpiresAt: v.number() })),
  handler: async (ctx, args) => {
    if (args.pass.length > 4096 || args.secret.length !== 64) {
      return null;
    }
    const game = await authenticatedPlayGame(ctx, args.gameId, args.secret);
    if (!game || !admitsPlayers(game) || game.state !== 'ready') {
      return null;
    }
    const pass = await verifySeatPass(game.secret, args.pass);
    if (pass?.gameId !== game._id) {
      return null;
    }
    const userId = ctx.db.normalizeId('users', pass.principalId);
    const sessionId = ctx.db.normalizeId('authSessions', pass.sessionId);
    if (!userId || !sessionId) {
      return null;
    }
    const authorization = await playSessionAuthorization(ctx, userId, sessionId);
    return authorization.allowed ? { authExpiresAt: Math.min(authorization.authExpiresAt, pass.exp) } : null;
  },
});
