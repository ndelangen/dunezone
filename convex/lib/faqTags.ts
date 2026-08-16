import { literals } from 'convex-helpers/validators';

import { FAQ_TAG_VALUES } from '../../src/shared/faq/tags';

/**
 * The one wire validator for the FAQ tag vocabulary, derived from its authority `FAQ_TAG_VALUES` (ADR-0002).
 * Adding a tag to the array propagates everywhere; hand-unrolled copies of this union must not exist.
 */
export const faqTagValidator = literals(...FAQ_TAG_VALUES);
