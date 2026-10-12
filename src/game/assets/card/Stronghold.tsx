import type { StrongholdCard as StrongholdCardSchema } from '@shared/assets/schema';
import { strongholdCardComposition } from '@shared/assets/strongholdCardTemplate';
import type { z } from 'zod';

import { CustomCard } from './Custom';

/** Draws authored content inside the fixed stronghold card composition. */
export function StrongholdCard(props: z.infer<typeof StrongholdCardSchema>) {
  return <CustomCard {...strongholdCardComposition(props)} wrapTitle />;
}
