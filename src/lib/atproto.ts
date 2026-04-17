/**
 * ATProto helpers for resolving profiles at build time.
 * Uses public Bluesky API — no authentication needed.
 */

const PUBLIC_API = 'https://public.api.bsky.app';

export interface AtProfile {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
}

const profileCache = new Map<string, AtProfile>();

/**
 * Resolve an ATProto handle or DID to a profile (name + avatar).
 * Results are cached for the duration of the build.
 */
export async function getProfile(handleOrDid: string): Promise<AtProfile> {
  const cached = profileCache.get(handleOrDid);
  if (cached) return cached;

  try {
    const url = `${PUBLIC_API}/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(handleOrDid)}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Profile fetch failed: ${res.status}`);
    }
    const data = await res.json();
    const profile: AtProfile = {
      did: data.did,
      handle: data.handle,
      displayName: data.displayName || undefined,
      avatar: data.avatar || undefined,
    };
    profileCache.set(handleOrDid, profile);
    profileCache.set(profile.did, profile);
    profileCache.set(profile.handle, profile);
    return profile;
  } catch {
    // Return a minimal fallback profile
    const fallback: AtProfile = {
      did: handleOrDid,
      handle: handleOrDid,
    };
    profileCache.set(handleOrDid, fallback);
    return fallback;
  }
}

/**
 * Extract an excerpt from text content.
 */
export function excerpt(text: string | undefined, maxLen = 150): string {
  if (!text) return '';
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= maxLen) return cleaned;
  return cleaned.slice(0, maxLen).replace(/\s+\S*$/, '') + '…';
}
