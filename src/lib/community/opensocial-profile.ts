import { openRepo } from './repo.js';

// Detects whether an account runs the opensocial.community software by checking
// its repo for a community.opensocial.profile/self record. Resolved live (against
// the account's own PDS) rather than curated, so the flag tracks reality.

const FLAG_CACHE_TTL_MS = 2 * 60 * 60 * 1000;
const flagCache = new Map<string, { value: boolean; expiresAt: number }>();

export async function hasOpenSocialProfile(handleOrDid: string): Promise<boolean> {
  const now = Date.now();
  const cached = flagCache.get(handleOrDid);
  if (cached && cached.expiresAt > now) return cached.value;

  let value = false;
  try {
    const { agent, did } = await openRepo({ handleOrDid });
    await agent.com.atproto.repo.getRecord({
      repo: did,
      collection: 'community.opensocial.profile',
      rkey: 'self',
    });
    value = true;
  } catch {
    // Missing record (404), unreachable PDS, or unresolvable handle all mean
    // "not detectably an opensocial community" — fall back to false.
    value = false;
  }

  flagCache.set(handleOrDid, { value, expiresAt: now + FLAG_CACHE_TTL_MS });
  return value;
}
