import { cookies } from "next/headers";
import { GUEST_COOKIE } from "@/middleware";

/**
 * The current visitor's anonymous id, set by middleware before this ever
 * runs. Falls back to a throwaway id only if middleware somehow didn't run
 * (e.g. a route outside its matcher) — never crashes a page over this.
 */
export async function getGuestId(): Promise<string> {
  const jar = await cookies();
  return jar.get(GUEST_COOKIE)?.value ?? "unknown-guest";
}
