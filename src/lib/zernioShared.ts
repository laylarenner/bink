/**
 * Client-safe pieces of the Zernio integration: no server-only imports here
 * (no env(), no fetch to Zernio), so client components can import from this
 * file directly without pulling node:fs into the browser bundle. See zernio.ts
 * for the actual API client, which only ever runs on the server.
 */

export type ZernioAccount = { id: string; platform: string; name: string; username: string | null };

// X is left out on purpose: it needs a payment method on the Zernio account
// before it can connect, so for now this person only posts to LinkedIn.
// Re-add { platform: "twitter", label: "X", ourPlatform: "x" } once that's sorted.
export const ZERNIO_CONNECT_PLATFORMS: { platform: string; label: string; ourPlatform: "linkedin" | "x" }[] = [
  { platform: "linkedin", label: "LinkedIn", ourPlatform: "linkedin" },
];
