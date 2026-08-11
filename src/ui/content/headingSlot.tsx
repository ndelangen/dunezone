import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

interface HeadingSlotValue {
  /**
   * The id the heading should carry, so the region around it can point `aria-labelledby` here.
   * `undefined` when the enclosing component does not name a landmark.
   */
  headingId: string | undefined;
}

const HeadingSlotContext = createContext<HeadingSlotValue | null>(null);

/**
 * Whether a heading is being rendered into a slot, and under which id.
 *
 * `null` means the heading is loose in a page body — see the warning in `Section` for why that is a
 * mistake rather than a style preference.
 */
export function useHeadingSlot(): HeadingSlotValue | null {
  return useContext(HeadingSlotContext);
}

/**
 * Marks the place where a component renders the heading it was handed.
 *
 * A heading and the content it names are one thing, but the two arrive from different places: the
 * caller passes a heading into a slot, the component renders the body somewhere below it. Nothing
 * in the types connects them, so the pairing is only real if some component owns it. This is how
 * such a component announces that it has — `Card`, `Region` and `SectionIntro` all provide it.
 */
export function HeadingSlot({
  headingId,
  children,
}: {
  headingId?: string;
  children: ReactNode;
}): ReactNode {
  return (
    <HeadingSlotContext.Provider value={{ headingId }}>{children}</HeadingSlotContext.Provider>
  );
}
