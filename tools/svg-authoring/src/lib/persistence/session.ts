import { get, set, del } from "idb-keyval";
import type { SvgDocument } from "@/lib/svg/types";

const SESSION_KEY = "svgtool.session.docs.v1";

/**
 * Persist the working document set to IndexedDB. SVG strings can be large, so
 * we keep them out of localStorage. Failures are swallowed — persistence is a
 * convenience, never a correctness requirement.
 */
export async function saveSession(docs: SvgDocument[]): Promise<void> {
  try {
    await set(SESSION_KEY, docs);
  } catch {
    /* ignore */
  }
}

export async function loadSession(): Promise<SvgDocument[] | null> {
  try {
    const docs = await get<SvgDocument[]>(SESSION_KEY);
    return Array.isArray(docs) ? docs : null;
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  try {
    await del(SESSION_KEY);
  } catch {
    /* ignore */
  }
}
