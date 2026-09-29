import { loadProfileSchema } from '../../src/shared/play/loadProfile';
import worker, { GameRoom as ProductionRoom } from './index';
import { loadFixturePlan } from './loadFixture';

type LoadEnv = GameEnv & { LOAD_PROFILE: string };

/**
 * The local stack's game Worker for a load run: the production Worker, whose fixtures seat the load players on the profile its `LOAD_PROFILE` names.
 * A real game provisions as it does in production.
 */
export class GameRoom extends ProductionRoom {
  constructor(ctx: DurableObjectState, env: LoadEnv) {
    super(ctx, env, loadFixturePlan(loadProfileSchema.parse(env.LOAD_PROFILE)));
  }
}

export default worker;
