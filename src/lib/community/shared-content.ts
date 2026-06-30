import type {
  SharedPost,
  AtProfile,
  CommunityEvent,
  BlogPost,
} from './types.js';
import { AtUri } from '@atproto/api';
import { isValidAtUri } from '@atproto/syntax';
import { normalizeEventMode, parseEventRecord } from './events.js';

const LEAFLET_BASE = 'https://leaflet.pub/profile';

export interface BlogPostRef {
  title: string;
  publishedAt: Date;
  path?: string;
  tags?: string[];
  textContent?: string;
  rkey: string;
  did: string;
}

export function parseBlogPostRef(
  value: Record<string, unknown>,
  ctx: { did: string; rkey: string },
): BlogPostRef | null {
  const publishedAt = safeParseDate(value.publishedAt as string | undefined | null);
  if (!publishedAt) return null;

  return {
    title: (value.title as string) || 'Untitled',
    publishedAt,
    path: (value.path as string) ?? undefined,
    tags: (value.tags as string[]) ?? undefined,
    textContent: (value.textContent as string) ?? undefined,
    rkey: ctx.rkey,
    did: ctx.did,
  };
}

export function hydrateBlogPost(
  ref: BlogPostRef,
  deps: { author: AtProfile; baseUrl?: string },
): BlogPost {
  return {
    title: ref.title,
    url: buildPostUrl(deps.baseUrl, ref.did, ref.rkey, ref.path),
    textContent: ref.textContent,
    publishedAt: ref.publishedAt,
    author: deps.author,
    path: ref.path,
    tags: ref.tags,
    rkey: ref.rkey,
    did: ref.did,
  };
}

function buildPostUrl(
  baseUrl: string | undefined,
  did: string,
  rkey: string,
  path: string | undefined,
): string {
  if (baseUrl && path) {
    return appendPath(baseUrl, path);
  }
  return `${LEAFLET_BASE}/${did}/${rkey}`;
}

export interface SharedDocumentRef {
  documentUri: string;
  titleOverride?: string;
  sharedBy?: string;
  sharedAt: Date;
  source: string;
  shareRecordUri: string;
  shareRecordRkey: string;
}

export interface SharedEventRef {
  documentUri: string;
  title?: string;
  sharedBy?: string;
  sharedAt: Date;
  source: string;
  fallbackStartsAt?: Date;
  fallbackEndsAt?: Date;
  fallbackLocation?: string;
  fallbackMode?: CommunityEvent['mode'];
}

type FetchRecordValue = (atUri: string) => Promise<Record<string, unknown> | null>;

export interface HydrateDocumentDeps {
  fetchRecord: FetchRecordValue;
  getProfile: (handle: string) => Promise<AtProfile>;
  baseUrl?: string;
}

export interface HydrateEventDeps {
  fetchRecord: FetchRecordValue;
}

// Single source of truth for what `community.opensocial.sharedContent` types exist and
// how they route: documents → feed, events → events list. Anything else is `'unknown'`
// and is dropped by both collections — the one place to extend when a new type appears.
export type SharedContentKind = 'event' | 'document' | 'unknown';

export function classifySharedContent(value: unknown): SharedContentKind {
  const type =
    typeof value === 'object' && value !== null
      ? (value as { type?: unknown }).type
      : undefined;
  if (type === 'event') return 'event';
  if (type === 'document') return 'document';
  return 'unknown';
}

export function parseSharedDocumentRef(
  value: Record<string, unknown>,
  ctx: {
    source: string;
    shareRecordUri: string;
    shareRecordRkey: string;
  },
): SharedDocumentRef | null {
  if (classifySharedContent(value) !== 'document') return null;

  const documentUri = asNonEmptyString(value.documentUri);
  if (!documentUri) return null;

  const sharedAt = safeParseDate(value.sharedAt as string | undefined);
  if (!sharedAt) return null;

  return {
    documentUri,
    titleOverride: asNonEmptyString(value.title),
    sharedBy: asNonEmptyString(value.sharedBy),
    sharedAt,
    source: ctx.source,
    shareRecordUri: ctx.shareRecordUri,
    shareRecordRkey: ctx.shareRecordRkey,
  };
}

export function parseSharedEventRef(
  value: Record<string, unknown>,
  ctx: { source: string },
): SharedEventRef | null {
  if (classifySharedContent(value) !== 'event') return null;

  const documentUri = asNonEmptyString(value.documentUri);
  if (!documentUri) return null;

  const sharedAt = safeParseDate(value.sharedAt as string | undefined);
  if (!sharedAt) return null;

  const fallbackMode =
    value.mode !== undefined ? normalizeEventMode(value.mode) : undefined;

  return {
    documentUri,
    title: asNonEmptyString(value.title),
    sharedBy: asNonEmptyString(value.sharedBy),
    sharedAt,
    source: ctx.source,
    fallbackStartsAt: safeParseDate(value.startsAt as string | undefined) ?? undefined,
    fallbackEndsAt: safeParseDate(value.endsAt as string | undefined) ?? undefined,
    fallbackLocation: asNonEmptyString(value.location),
    fallbackMode,
  };
}

export async function hydrateSharedDocument(
  ref: SharedDocumentRef,
  deps: HydrateDocumentDeps,
): Promise<SharedPost | null> {
  const parsed = new AtUri(ref.documentUri);

  const docValue = await deps.fetchRecord(ref.documentUri);
  if (!docValue) return null;

  const [author, sharedBy] = await Promise.all([
    deps.getProfile(parsed.host),
    ref.sharedBy ? deps.getProfile(ref.sharedBy) : Promise.resolve(undefined),
  ]);
  const url = await resolveStandardDocumentUrl(
    docValue,
    parsed.host,
    parsed.rkey,
    deps.fetchRecord,
    deps.baseUrl,
  );

  const textContent = (docValue.textContent as string) ?? undefined;
  const publishedAt = safeParseDate(docValue.publishedAt as string | undefined);

  return {
    title: ref.titleOverride || (docValue.title as string) || 'Untitled',
    url,
    textContent,
    publishedAt: publishedAt ?? undefined,
    sharedAt: ref.sharedAt,
    author,
    sharedBy,
    source: ref.source,
    documentUri: ref.documentUri,
    shareRecordUri: ref.shareRecordUri,
    shareRecordRkey: ref.shareRecordRkey,
    tags: (docValue.tags as string[]) ?? undefined,
  };
}

export async function hydrateSharedEvent(
  ref: SharedEventRef,
  deps: HydrateEventDeps,
): Promise<CommunityEvent | null> {
  const parsed = new AtUri(ref.documentUri);

  try {
    const value = await deps.fetchRecord(ref.documentUri);
    if (value) {
      const event = parseEventRecord(value, {
        did: parsed.host,
        rkey: parsed.rkey,
        source: ref.source,
      });
      if (event) return event;
    }
  } catch {
    // Fall through to embedded fallback
  }

  if (!ref.title || !ref.fallbackStartsAt) return null;

  return {
    name: ref.title,
    startsAt: ref.fallbackStartsAt,
    endsAt: ref.fallbackEndsAt,
    description: undefined,
    mode: ref.fallbackMode ?? 'virtual',
    status: 'scheduled',
    location: ref.fallbackLocation,
    locationDetail: undefined,
    uri: `https://smokesignal.events/${parsed.host}/${parsed.rkey}`,
    atUri: ref.documentUri,
    source: ref.source,
    rkey: parsed.rkey,
    did: parsed.host,
  };
}

export async function resolveStandardDocumentUrl(
  docValue: Record<string, unknown>,
  repo: string,
  rkey: string,
  fetchRecord: FetchRecordValue,
  fallbackBaseUrl?: string,
): Promise<string> {
  const path = docValue.path as string | undefined;

  const site = typeof docValue.site === 'string' ? docValue.site : undefined;

  if (site && !isValidAtUri(site) && path) return appendPath(site, path);

  if (site && isValidAtUri(site)) {
    try {
      const pub = await fetchRecord(site);
      const pubUrl = pub?.url as string | undefined;
      if (pubUrl && path) return appendPath(pubUrl, path);
    } catch {
      // Fall through
    }
  }

  if (fallbackBaseUrl && path) return appendPath(fallbackBaseUrl, path);

  return `${LEAFLET_BASE}/${repo}/${rkey}`;
}

function appendPath(baseUrl: string, path: string): string {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const segment = path.startsWith('/') ? path.slice(1) : path;
  return new URL(segment, base).toString();
}

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function safeParseDate(value: string | undefined | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}
