/**
 * Fetch community.lexicon.calendar.event records from ATProto at build time.
 * Designed to accept multiple account DIDs for future multi-account support.
 */

const COLLECTION = 'community.lexicon.calendar.event';

/** Parsed event ready for rendering */
export interface CommunityEvent {
  name: string;
  date: string;           // ISO string for startsAt
  endDate?: string;       // ISO string for endsAt
  location?: string;      // Human-readable location
  mode: 'online' | 'in_person' | 'hybrid';
  description?: string;   // Plain text (facets stripped)
  href: string;           // Link to RSVP or event page
  source: string;         // Handle/DID of the account
}

interface RawLocation {
  $type: string;
  name?: string;
  locality?: string;
  region?: string;
  country?: string;
  [key: string]: unknown;
}

interface RawUri {
  uri: string;
  name?: string;
  $type: string;
  source?: string;
}

interface RawEvent {
  $type: string;
  name: string;
  startsAt: string;
  endsAt?: string;
  description?: string;
  mode?: string;
  status?: string;
  locations?: RawLocation[];
  uris?: RawUri[];
  createdAt?: string;
  [key: string]: unknown;
}

/**
 * Resolve a handle to a DID using the public API.
 */
async function resolveHandle(handle: string): Promise<string> {
  if (handle.startsWith('did:')) return handle;
  const res = await fetch(
    `https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`
  );
  if (!res.ok) throw new Error(`Failed to resolve handle ${handle}: ${res.status}`);
  const data = await res.json();
  return data.did;
}

/**
 * Look up the PDS endpoint for a DID.
 * Handles both did:plc (via PLC directory) and did:web (via .well-known).
 */
async function resolvePds(did: string): Promise<string> {
  if (did.startsWith('did:web:')) {
    // did:web resolution: fetch the DID document from the domain
    const domain = did.slice('did:web:'.length).replace(/%3A/g, ':');
    const didDocUrl = `https://${domain}/.well-known/did.json`;
    const res = await fetch(didDocUrl);
    if (!res.ok) throw new Error(`Failed to resolve did:web ${did}: ${res.status}`);
    const doc = await res.json();
    const service = doc.service?.find(
      (s: { id: string; type: string; serviceEndpoint: string }) =>
        s.id === '#atproto_pds' || s.id === `${did}#atproto_pds`
    );
    if (!service) throw new Error(`No PDS found for ${did}`);
    return service.serviceEndpoint;
  }

  // did:plc resolution via PLC directory
  const res = await fetch(`https://plc.directory/${did}`);
  if (!res.ok) throw new Error(`Failed to resolve PDS for ${did}: ${res.status}`);
  const doc = await res.json();
  const service = doc.service?.find(
    (s: { id: string; type: string; serviceEndpoint: string }) =>
      s.id === '#atproto_pds'
  );
  if (!service) throw new Error(`No PDS found for ${did}`);
  return service.serviceEndpoint;
}

/**
 * Fetch all event records from a single account.
 */
async function fetchEventsFromAccount(
  handleOrDid: string
): Promise<CommunityEvent[]> {
  const did = await resolveHandle(handleOrDid);
  const pds = await resolvePds(did);

  const events: CommunityEvent[] = [];
  let cursor: string | undefined;

  do {
    const params = new URLSearchParams({
      repo: did,
      collection: COLLECTION,
      limit: '100',
    });
    if (cursor) params.set('cursor', cursor);

    const res = await fetch(`${pds}/xrpc/com.atproto.repo.listRecords?${params}`);
    if (!res.ok) throw new Error(`listRecords failed: ${res.status}`);

    const data = await res.json();
    const records = data.records as Array<{ uri: string; value: RawEvent }>;

    for (const record of records) {
      const v = record.value;
      events.push(parseEvent(v, handleOrDid, record.uri));
    }

    cursor = data.cursor;
  } while (cursor);

  return events;
}

/**
 * Simplify a full street address to city, state/region, country.
 * e.g. "1551 Southeast Poplar Avenue, Portland, Multnomah County, Oregon, 97214, United States"
 *   → "Portland, Oregon, US"
 */
function simplifyAddress(raw: string): string {
  const parts = raw.split(',').map(p => p.trim());
  if (parts.length <= 3) return raw; // already short enough

  // Filter out: street numbers/addresses, county names, postal codes
  const filtered = parts.filter(p => {
    if (/^\d/.test(p)) return false;                      // starts with number (street addr or zip)
    if (/county$/i.test(p)) return false;                 // "Multnomah County"
    if (/^\d{4,}/.test(p.replace(/\s/g, ''))) return false; // postal codes
    return true;
  });

  // Take the last 3 meaningful parts (typically city, state, country)
  const meaningful = filtered.slice(-3);
  return meaningful.join(', ') || raw;
}

/**
 * Parse a raw event record into our clean format.
 */
function parseEvent(v: RawEvent, source: string, uri: string): CommunityEvent {
  // Parse mode
  let mode: CommunityEvent['mode'] = 'in_person';
  if (v.mode?.includes('#virtual')) mode = 'online';
  else if (v.mode?.includes('#hybrid')) mode = 'hybrid';

  // Extract location from the first address-type location
  let location: string | undefined;
  if (v.locations?.length) {
    const addr = v.locations.find(l => l.$type?.includes('address'));
    if (addr) {
      const parts = [addr.locality, addr.region, addr.country].filter(Boolean);
      location = parts.join(', ') || addr.name;
    } else {
      // For geo/other location types, the name may be a full street address.
      // Try to extract city, state, country from a comma-separated address string.
      const raw = v.locations[0]?.name;
      if (raw) {
        location = simplifyAddress(raw);
      }
    }
  }

  // Find the best RSVP/event link
  // Priority: "OpenMeet Event" named link > first non-image URI > fallback to Smoke Signal
  let href = '';
  if (v.uris?.length) {
    const openMeetLink = v.uris.find(u => u.name === 'OpenMeet Event');
    if (openMeetLink) {
      href = openMeetLink.uri;
    } else {
      // Skip image URIs (common in OpenMeet records)
      const nonImageUri = v.uris.find(u =>
        u.name !== 'Event Image' && !u.uri.match(/\.(jpg|jpeg|png|gif|webp)$/i)
      );
      href = nonImageUri?.uri ?? v.uris[0].uri;
    }
  }
  // Fallback to Smoke Signal event page using the AT URI
  if (!href) {
    const parts = uri.match(/at:\/\/([^/]+)\/[^/]+\/(.+)/);
    if (parts) {
      href = `https://smokesignal.events/${parts[1]}/${parts[2]}`;
    }
  }

  // Strip facets from description — just use plain text
  const description = v.description?.replace(/\n+/g, ' ').trim();

  return {
    name: v.name,
    date: v.startsAt,
    endDate: v.endsAt,
    location,
    mode,
    description,
    href,
    source,
  };
}

/**
 * Fetch events from one or more ATProto accounts.
 * Returns upcoming events sorted by date ascending.
 */
export async function fetchEvents(
  accounts: string[]
): Promise<CommunityEvent[]> {
  // Fetch all accounts in parallel for faster builds
  const results = await Promise.allSettled(
    accounts.map(account => fetchEventsFromAccount(account))
  );

  const allEvents: CommunityEvent[] = [];
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === 'fulfilled') {
      allEvents.push(...result.value);
    } else {
      console.warn(`Failed to fetch events from ${accounts[i]}:`, result.reason);
    }
  }

  // Filter to upcoming events and sort by date
  const now = new Date();
  return allEvents
    .filter(e => new Date(e.date) >= now)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}
