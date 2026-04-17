/**
 * Preflight checks for build-time data fetching.
 * Verifies core ATProto services are reachable before building.
 * If services are down, the build should fail rather than deploy
 * a site with missing data.
 */

const CHECKS = [
  {
    name: 'Bluesky Public API',
    url: 'https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=atmosphere.community',
  },
  {
    name: 'atmosphere.community PDS',
    url: 'https://hydnum.us-west.host.bsky.network/xrpc/com.atproto.repo.describeRepo?repo=did:plc:lehcqqkwzcwvjvw66uthu5oq',
  },
];

/**
 * Run preflight checks. Throws if any core service is unreachable.
 * Call this early in page rendering to fail the build fast.
 */
export async function preflight(): Promise<void> {
  const failures: string[] = [];

  for (const check of CHECKS) {
    try {
      const res = await fetch(check.url, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) {
        failures.push(`${check.name}: HTTP ${res.status}`);
      }
    } catch (err) {
      failures.push(`${check.name}: ${err instanceof Error ? err.message : 'unreachable'}`);
    }
  }

  if (failures.length > 0) {
    const msg = [
      'Preflight check failed — core ATProto services are unreachable.',
      'Build aborted to avoid deploying a site with missing data.',
      'The next scheduled build will retry automatically.',
      '',
      ...failures.map(f => `  ✗ ${f}`),
    ].join('\n');
    throw new Error(msg);
  }
}
