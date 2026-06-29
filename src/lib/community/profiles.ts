import { Agent } from '@atproto/api';
import type { AtProfile } from './types.js';
import { resolveHandleToDid } from './identity.js';

const PUBLIC_API = 'https://public.api.bsky.app';
const PROFILE_CACHE_TTL_MS = 2 * 60 * 60 * 1000;

interface CachedProfile {
  profile: AtProfile;
  expiresAt: number;
}

const profileCache = new Map<string, CachedProfile>();

// Curated source accounts (community handles + the site's own account) live in a
// separate cache. Warmed once at server boot via prefetchSourceProfiles so
// per-record transformers in live.config.ts hit it instead of refetching.
// Kept distinct from profileCache so any future eviction policy on the general
// cache (LRU/TTL for arbitrary external authors) doesn't drop our known set.
const sourceProfileCache = new Map<string, CachedProfile>();

function getFreshProfile(
  cache: Map<string, CachedProfile>,
  key: string,
  now = Date.now(),
): AtProfile | undefined {
  const cached = cache.get(key);
  if (!cached || cached.expiresAt <= now) return undefined;
  return cached.profile;
}

function cacheProfile(
  cache: Map<string, CachedProfile>,
  key: string,
  profile: AtProfile,
  now = Date.now(),
): void {
  cache.set(key, {
    profile,
    expiresAt: now + PROFILE_CACHE_TTL_MS,
  });
}

function cacheSourceProfile(
  key: string,
  profile: AtProfile,
  now = Date.now(),
): void {
  // Index by every key callers might pass: original handle (may differ from
  // canonical), resolved did, and resolved handle.
  cacheProfile(sourceProfileCache, key, profile, now);
  cacheProfile(sourceProfileCache, profile.did, profile, now);
  cacheProfile(sourceProfileCache, profile.handle, profile, now);
}

async function fetchProfile(handleOrDid: string): Promise<AtProfile> {
  let did: string;
  try {
    did = await resolveHandleToDid(handleOrDid);
  } catch {
    did = handleOrDid;
  }

  try {
    const agent = new Agent(new URL(PUBLIC_API));
    const response = await agent.getProfile({ actor: did });
    return {
      did: response.data.did,
      handle: response.data.handle,
      displayName: response.data.displayName || undefined,
      avatar: response.data.avatar || undefined,
    };
  } catch (err) {
    console.warn(`Failed to fetch profile for ${did}:`, err);
    return {
      did,
      handle: handleOrDid.startsWith('did:') ? did : handleOrDid,
    };
  }
}

export async function prefetchSourceProfiles(handles: string[]): Promise<void> {
  const results = await Promise.allSettled(handles.map((h) => fetchProfile(h)));
  results.forEach((result, i) => {
    if (result.status !== 'fulfilled') return;
    cacheSourceProfile(handles[i], result.value);
  });
}

export async function getProfile(handleOrDid: string): Promise<AtProfile> {
  const sourceHit = getFreshProfile(sourceProfileCache, handleOrDid);
  if (sourceHit) return sourceHit;

  let did: string;
  try {
    did = await resolveHandleToDid(handleOrDid);
  } catch {
    did = handleOrDid;
  }

  const sourceHitByDid = getFreshProfile(sourceProfileCache, did);
  if (sourceHitByDid) return sourceHitByDid;

  const cached = getFreshProfile(profileCache, did);
  if (cached) return cached;

  const profile = await fetchProfile(handleOrDid);
  if (sourceProfileCache.has(handleOrDid) || sourceProfileCache.has(did)) {
    cacheSourceProfile(handleOrDid, profile);
  } else {
    cacheProfile(profileCache, did, profile);
  }
  return profile;
}
