import type {
  AtProtoRecordCallbackArgs,
  FetchRecord,
} from '@fujocoded/astro-atproto-loader';
import { z } from 'astro/zod';
import { remark } from 'remark';
import { toString as mdastToString } from 'mdast-util-to-string';
import type { CommunityEvent } from './community/types.js';
import {
  getProfile,
  hydrateBlogPost,
  hydrateSharedDocument,
  hydrateSharedEvent,
  parseBlogPostRef,
  parseEventRecord,
  parseSharedDocumentRef,
  parseSharedEventRef,
  classifySharedContent,
} from './community/index.js';
import type { SharedEventRef } from './community/index.js';
import { getRepoRecordByUri } from './community/repo.js';

// The grouped event transformer needs a CID for reshared events so users can RSVP.
// The loader's fetchRecord doesn't surface CIDs from external repos, so we resolve
// the canonical record's PDS ourselves and read it directly. Best-effort: any failure
// just means RSVP stays disabled for that card.
async function fetchCanonicalCid(atUri: string): Promise<string | undefined> {
  try {
    return (await getRepoRecordByUri(atUri))?.cid;
  } catch {
    return undefined;
  }
}

const OFFPRINT_PUB =
  'at://did:plc:lehcqqkwzcwvjvw66uthu5oq/site.standard.publication/3mjnpilwnrp2v';
const ATMOSPHERE_BLOG_URL = 'https://blog.atmosphere.community';

const markdownParser = remark();
const EXCERPT_MAX_LENGTH = 150;
const EXCERPT_CACHE_LIMIT = 500;
const excerptCache = new Map<string, string>();

// Pulls the first paragraph (the typical lede) out of a markdown body and
// trims it to a card-friendly snippet. Falls back to flattening the whole tree
// if the doc has no paragraph node (e.g. starts with a heading or list).
// Cached because the same posts re-render across requests in server output.
function excerpt(text: string): string {
  const cached = excerptCache.get(text);
  if (cached !== undefined) return cached;

  const tree = markdownParser.parse(text);
  const firstParagraph = tree.children.find((node) => node.type === 'paragraph');
  const plain = mdastToString(firstParagraph ?? tree).replace(/\s+/g, ' ').trim();

  let result: string;
  if (plain.length <= EXCERPT_MAX_LENGTH) {
    result = plain;
  } else {
    const truncated = plain.slice(0, EXCERPT_MAX_LENGTH);
    const lastSpace = truncated.lastIndexOf(' ');
    const cutPoint =
      lastSpace > EXCERPT_MAX_LENGTH * 0.5 ? lastSpace : EXCERPT_MAX_LENGTH;
    result = truncated.slice(0, cutPoint) + '…';
  }

  if (excerptCache.size >= EXCERPT_CACHE_LIMIT) {
    excerptCache.delete(excerptCache.keys().next().value!);
  }
  excerptCache.set(text, result);
  return result;
}

// Avatar is a discriminated union: a real CDN URL when the profile has one,
// otherwise a deterministic initials+color pair the consumer renders as a tile.
// Components branch once on shape rather than juggling avatar / fallback fields.
const authorSchema = z.object({
  did: z.string(),
  handle: z.string(),
  displayName: z.string().optional(),
  avatar: z.union([
    z.object({ url: z.string() }),
    z.object({ initials: z.string(), color: z.string() }),
  ]),
});

export const feedOutputSchema = z.object({
  title: z.string(),
  url: z.string(),
  excerpt: z.string().optional(),
  publishedAt: z.coerce.date().optional(),
  sharedAt: z.coerce.date(),
  author: authorSchema,
  sharedBy: authorSchema.optional(),
  source: z.string(),
  documentUri: z.string(),
  shareRecordUri: z.string().optional(),
  shareRecordRkey: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export const eventsOutputSchema = z.object({
  name: z.string(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date().optional(),
  description: z.string().optional(),
  mode: z.enum(['inperson', 'virtual', 'hybrid']),
  location: z.string().optional(),
  uri: z.string(),
  atUri: z.string(),
  source: z.string(),
  rkey: z.string().optional(),
  did: z.string().optional(),
  cid: z.string().optional(),
  // Provenance: which community account hosts the canonical calendar event,
  // and which others reshared it. `original` is undefined when the host isn't
  // one of our tracked accounts (event surfaces only via reshares).
  original: z.string().optional(),
  sharedBy: z.array(z.string()).default([]),
  isPast: z.boolean(),
  // Avatar of the hosting community (event.source). Resolved via the warmed
  // source-profile cache in live.config.ts so this is effectively free per-record.
  sourceAvatar: z.string().optional(),
});

type FeedEntry = z.input<typeof feedOutputSchema>;
type EventEntry = z.input<typeof eventsOutputSchema>;

// Pre-enrichment shape returned by per-collection feed transformers. They emit
// the raw AtProto profile (avatar as plain URL string); the wrapper in
// live.config.ts collapses that into the schema's discriminated union.
export type RawFeedEntry = Omit<FeedEntry, 'author' | 'sharedBy'> & {
  author: {
    did: string;
    handle: string;
    displayName?: string;
    avatar?: string;
  };
  sharedBy?: {
    did: string;
    handle: string;
    displayName?: string;
    avatar?: string;
  };
};

export type LoaderArgs = AtProtoRecordCallbackArgs;
type SharedEventLoaderArgs = LoaderArgs & {
  collection: 'community.opensocial.sharedContent';
  value: SharedEventRef;
};

type FilterFn = (ctx: LoaderArgs) => boolean;
type TransformFn<Entry> = (
  ctx: LoaderArgs,
) => Promise<{ id: string; data: Entry } | null>;

const sourceLabel = (ctx: LoaderArgs): string =>
  ctx.repo.handle ?? ctx.repo.did;

export const feedFilters: Record<string, FilterFn> = {
  'site.standard.document': (ctx) => {
    const ref = parseBlogPostRef(ctx.value as Record<string, unknown>, {
      did: ctx.repo.did,
      rkey: ctx.rkey,
    });
    return !!ref && (ctx.value as { site?: unknown }).site === OFFPRINT_PUB;
  },
  'community.opensocial.sharedContent': (ctx) => {
    const ref = parseSharedDocumentRef(ctx.value as Record<string, unknown>, {
      source: sourceLabel(ctx),
      shareRecordUri: ctx.uri,
      shareRecordRkey: ctx.rkey,
    });
    return !!ref && ref.documentUri.startsWith('at://');
  },
};

export const feedTransformers: Record<string, TransformFn<RawFeedEntry>> = {
  'site.standard.document': async (ctx) => {
    const ref = parseBlogPostRef(ctx.value as Record<string, unknown>, {
      did: ctx.repo.did,
      rkey: ctx.rkey,
    });
    if (!ref) return null;
    const author = await getProfile('atmosphere.community');
    const post = hydrateBlogPost(ref, {
      author,
      baseUrl: ATMOSPHERE_BLOG_URL,
    });
    const { textContent, ...rest } = post;
    return {
      id: ctx.uri,
      data: {
        ...rest,
        excerpt: textContent ? excerpt(textContent) : undefined,
        sharedAt: post.publishedAt,
        source: 'atmosphere.community',
        documentUri: ctx.uri,
      },
    };
  },
  'community.opensocial.sharedContent': async (ctx) => {
    const ref = parseSharedDocumentRef(ctx.value as Record<string, unknown>, {
      source: sourceLabel(ctx),
      shareRecordUri: ctx.uri,
      shareRecordRkey: ctx.rkey,
    });
    if (!ref) return null;
    const post = await hydrateSharedDocument(ref, {
      fetchRecord: async (atUri: string) => {
        const result = await ctx.fetchRecord({ atUri });
        return result?.value ?? null;
      },
      getProfile,
      baseUrl: ATMOSPHERE_BLOG_URL,
    });
    if (!post) return null;
    const { textContent, ...rest } = post;
    return {
      id: ctx.uri,
      data: {
        ...rest,
        excerpt: textContent ? excerpt(textContent) : undefined,
      },
    };
  },
};

export const eventFilters: Record<string, FilterFn> = {
  'community.lexicon.calendar.event': (ctx) =>
    !!parseEventRecord(ctx.value as Record<string, unknown>, {
      did: ctx.repo.did,
      rkey: ctx.rkey,
      source: sourceLabel(ctx),
    }),
  // sharedContent holds both event shares and document shares. parseSharedEventRecord
  // turns event shares into SharedEventRef and passes everything else through unchanged;
  // here we keep only the parsed event shares so document shares are dropped quietly.
  'community.opensocial.sharedContent': (ctx) => isSharedEventLoaderArgs(ctx),
};

// parseRecord for the events collection's sharedContent source. The collection mixes
// event shares with document shares, so a non-event record is *expected*: return it
// unchanged and let the events filter drop it quietly (no loader warning). A record that
// claims to be an event share but is malformed is a real problem, so still throw —
// that surfaces the loader's parseRecord warning for genuine data errors.
export function parseSharedEventRecord(
  value: unknown,
  source: string,
): SharedEventRef | unknown {
  // Document shares (and any unknown type) belong to the feed, not the events list —
  // drop them via the filter rather than the warning path.
  if (classifySharedContent(value) !== 'event') return value;
  const record = value as Record<string, unknown>;

  const ref = parseSharedEventRef(record, { source });
  if (!ref) throw new TypeError('shared event record is malformed');
  if (!ref.documentUri.startsWith('at://')) {
    throw new TypeError('shared event must point at an AT URI');
  }
  return ref;
}

function isSharedEventLoaderArgs(ctx: LoaderArgs): ctx is SharedEventLoaderArgs {
  return (
    ctx.collection === 'community.opensocial.sharedContent' &&
    typeof ctx.value === 'object' &&
    ctx.value !== null &&
    'documentUri' in ctx.value &&
    'sharedAt' in ctx.value &&
    'source' in ctx.value
  );
}

// Group key for event records: collapse a native calendar event and any reshares
// of it onto the same canonical at-URI. Reshares carry the host's URI in their
// `subject` (parsed as `documentUri`); a reshare that fails to parse falls back
// to its own URI so it still produces a usable single-record group.
export function eventGroupKey(ctx: LoaderArgs): string {
  if (ctx.collection === 'community.lexicon.calendar.event') return ctx.uri;
  if (isSharedEventLoaderArgs(ctx)) return ctx.value.documentUri;
  return ctx.uri;
}

// Pick canonical record for a grouped event and annotate provenance.
// Native record (if any) wins as canonical — sources are declared natives-first
// so `records[0]` is the native when one exists. Reshares contribute `sharedBy`.
export async function transformEventGroup(args: {
  key: string;
  records: LoaderArgs[];
  fetchRecord: FetchRecord;
}): Promise<{ id: string; data: EventEntry } | null> {
  const native = args.records.find(
    (r) => r.collection === 'community.lexicon.calendar.event',
  );
  const reshares = args.records.filter(isSharedEventLoaderArgs);

  let event: CommunityEvent | null = null;
  let cid: string | undefined;

  if (native) {
    event = parseEventRecord(native.value as Record<string, unknown>, {
      did: native.repo.did,
      rkey: native.rkey,
      source: sourceLabel(native),
    });
    cid = native.cid;
  } else {
    for (const reshare of reshares) {
      const ref = reshare.value;
      event = await hydrateSharedEvent(ref, {
        fetchRecord: async (atUri: string) => {
          const result = await args.fetchRecord({ atUri });
          return result?.value ?? null;
        },
      });
      if (event) {
        cid = await fetchCanonicalCid(event.atUri);
        break;
      }
    }
  }

  if (!event) return null;

  const original = native ? sourceLabel(native) : undefined;
  const sharedBy = [...new Set(reshares.map(sourceLabel))];
  const endTime = (event.endsAt ?? event.startsAt).getTime();
  const isPast = endTime < Date.now();
  const sourceAvatar = event.source
    ? (await getProfile(event.source).catch(() => null))?.avatar
    : undefined;

  return {
    id: args.key,
    data: { ...event, cid, original, sharedBy, isPast, sourceAvatar },
  };
}
