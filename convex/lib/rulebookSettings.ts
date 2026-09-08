import { literals } from 'convex-helpers/validators';
import { v } from 'convex/values';

import { rulebookDesignSchema, rulebookSizeSchema } from '../../src/shared/rulebooks/settings';

export const rulebookDesignValidator = literals(...rulebookDesignSchema.options);
export const rulebookSettingsValidator = v.object({
  size: literals(...rulebookSizeSchema.options),
  design: rulebookDesignValidator,
});
