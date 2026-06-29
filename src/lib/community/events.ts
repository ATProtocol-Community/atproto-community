import type { CommunityEvent, LocationDetail } from './types.js';
import { AtUri } from '@atproto/api';

const IMAGE_EXTENSIONS = /\.(jpg|jpeg|png|gif|webp|svg|avif)$/i;

export function parseEventRecord(
  value: Record<string, unknown>,
  ctx: { did: string; rkey: string; source: string },
): CommunityEvent | null {
  const startsAt = parseDate(value.startsAt as string);
  if (!startsAt) return null;

  const endsAt = value.endsAt ? parseDate(value.endsAt as string) : undefined;

  return {
    name: value.name as string,
    startsAt,
    endsAt: endsAt ?? undefined,
    description: (value.description as string) ?? undefined,
    mode: normalizeEventMode(value.mode),
    status: (value.status as string) ?? 'scheduled',
    location: extractLocationString(value.locations as unknown[]),
    locationDetail: extractLocationDetail(value.locations as unknown[]),
    uri: selectEventUri(value.uris as unknown[], ctx.did, ctx.rkey),
    atUri: `at://${ctx.did}/community.lexicon.calendar.event/${ctx.rkey}`,
    source: ctx.source,
    rkey: ctx.rkey,
    did: ctx.did,
  };
}

function parseDate(value: string | undefined | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

export function normalizeEventMode(value: unknown): CommunityEvent['mode'] {
  // Lexicon tokens arrive as either a fragment (`#hybrid`) or a fully-qualified
  // ref (`community.lexicon.calendar.event#hybrid`). Take whatever follows the
  // last `#` so both forms collapse to the bare token.
  const raw = String(value ?? '');
  const s = raw.includes('#') ? raw.slice(raw.lastIndexOf('#') + 1) : raw;
  if (s === 'in-person') return 'inperson';
  if (s === 'inperson' || s === 'virtual' || s === 'hybrid') return s;
  return 'virtual';
}

function selectEventUri(uris: unknown[] | undefined, did: string, rkey: string): string {
  const smokeFallback = `https://smokesignal.events/${did}/${rkey}`;
  if (!uris || uris.length === 0) return smokeFallback;

  const openMeet = uris.find((u) => isUriObject(u) && u.name === 'OpenMeet Event');
  if (openMeet && isUriObject(openMeet)) return openMeet.uri;

  const nonImage = uris.find(
    (u) =>
      isUriObject(u) &&
      u.name !== 'Event Image' &&
      !IMAGE_EXTENSIONS.test(u.uri),
  );
  if (nonImage && isUriObject(nonImage)) return nonImage.uri;

  const first = uris[0];
  if (isUriObject(first)) return first.uri;

  return smokeFallback;
}

function isUriObject(u: unknown): u is { uri: string; name?: string } {
  return typeof u === 'object' && u !== null && 'uri' in u && typeof (u as { uri: unknown }).uri === 'string';
}

function extractLocationString(locations: unknown[] | undefined): string | undefined {
  if (!locations || locations.length === 0) return undefined;
  const loc = locations[0] as Record<string, unknown>;

  if (loc.locality || loc.region || loc.country) {
    return [loc.locality, loc.region, loc.country].filter(Boolean).join(', ');
  }

  if (loc.latitude !== undefined && loc.longitude !== undefined) {
    if (typeof loc.name === 'string' && loc.name.length > 0) {
      return simplifyGeoAddress(loc.name);
    }
    return `${loc.latitude}, ${loc.longitude}`;
  }

  if (typeof loc.name === 'string') return loc.name;
  return undefined;
}

function extractLocationDetail(locations: unknown[] | undefined): LocationDetail | undefined {
  if (!locations || locations.length === 0) return undefined;
  const loc = locations[0] as Record<string, unknown>;

  if (loc.locality || loc.region || loc.country) {
    return {
      type: 'address',
      name: loc.name as string | undefined,
      locality: loc.locality as string | undefined,
      region: loc.region as string | undefined,
      country: loc.country as string | undefined,
    };
  }

  if (loc.latitude !== undefined && loc.longitude !== undefined) {
    return {
      type: 'geo',
      name: loc.name as string | undefined,
      latitude: loc.latitude as number,
      longitude: loc.longitude as number,
    };
  }

  if (loc.$type && String(loc.$type).includes('hthree')) {
    return {
      type: 'hthree',
      name: loc.name as string | undefined,
    };
  }

  return undefined;
}

export function smokeSignalHref(atUri: string): string {
  try {
    const parsed = new AtUri(atUri);
    return `https://smokesignal.events/${parsed.host}/${parsed.rkey}`;
  } catch {
    return '';
  }
}

export function simplifyGeoAddress(address: string): string {
  const parts = address.split(',').map((s) => s.trim()).filter(Boolean);
  const meaningful = parts.filter((part) => {
    if (/^\d+\s/.test(part)) return false;
    if (/^\d{4,}$/.test(part.replace(/\s/g, ''))) return false;
    if (/\bcounty\b/i.test(part)) return false;
    return true;
  });
  return meaningful.slice(-3).join(', ');
}
