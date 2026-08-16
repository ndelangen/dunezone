import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

const SectionDepth = createContext(0);

/**
 * How deep the current named part of a page sits inside other named parts.
 * 
 * A heading's loudness is a fact about where it is, not about what it says, and only the enclosing block knows that.
 * Reading it here is what lets a caller pass a title and nothing else.
 */
export function useSectionDepth(): number {
  return useContext(SectionDepth);
}

/** Wraps the content of a titled block, so anything titled inside it speaks one step quieter. */
export function OneLevelDeeper({ depth, children }: { depth: number; children: ReactNode }) {
  return <SectionDepth.Provider value={depth + 1}>{children}</SectionDepth.Provider>;
}
