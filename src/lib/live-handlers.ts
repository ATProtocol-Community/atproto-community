import type { AtProtoRecordCallbackArgs } from "@fujocoded/astro-atproto-loader";
import {
  getProfile,
  hydrateBlogPost,
  hydrateSharedDocument,
  hydrateSharedEvent,
  parseBlogPostRef,
  parseEventRecord,
  parseSharedDocumentRef,
  parseSharedEventRef,
} from "@opensocial/community";

const OFFPRINT_PUB =
  "at://did:plc:lehcqqkwzcwvjvw66uthu5oq/site.standard.publication/3mjnpilwnrp2v";
const ATMOSPHERE_BLOG_URL = "https://blog.atmosphere.community";

export type LoaderArgs = AtProtoRecordCallbackArgs;

type FilterFn = (ctx: LoaderArgs) => boolean;
type DedupeFn = (ctx: LoaderArgs) => string | null;
type TransformFn<Entry> = (
  ctx: LoaderArgs,
) => Promise<{ id: string; data: Entry } | null>;

type Entry = Record<string, unknown>;

export const feedFilters: Record<string, FilterFn> = {
  "site.standard.document": ({ value, did, rkey }) => {
    const ref = parseBlogPostRef(value as Record<string, unknown>, {
      did,
      rkey,
    });
    return !!ref && (value as { site?: unknown }).site === OFFPRINT_PUB;
  },
  "community.opensocial.sharedContent": ({ value, repo }) => {
    const ref = parseSharedDocumentRef(value as Record<string, unknown>, {
      source: repo,
    });
    return !!ref && ref.documentUri.startsWith("at://");
  },
};

export const feedDedupers: Record<string, DedupeFn> = {
  "site.standard.document": ({ uri }) => uri,
  "community.opensocial.sharedContent": ({ value }) => {
    const ref = parseSharedDocumentRef(value as Record<string, unknown>, {
      source: "",
    });
    return ref?.documentUri ?? null;
  },
};

export const feedTransformers: Record<string, TransformFn<Entry>> = {
  "site.standard.document": async ({ value, uri, did, rkey }) => {
    const ref = parseBlogPostRef(value as Record<string, unknown>, {
      did,
      rkey,
    });
    if (!ref) return null;
    const author = await getProfile("atmosphere.community");
    const post = hydrateBlogPost(ref, {
      author,
      baseUrl: ATMOSPHERE_BLOG_URL,
    });
    return {
      id: uri,
      data: {
        ...post,
        sharedAt: post.publishedAt,
        source: "atmosphere.community",
        documentUri: uri,
      },
    };
  },
  "community.opensocial.sharedContent": async ({ value, repo, fetchRecord }) => {
    const ref = parseSharedDocumentRef(value as Record<string, unknown>, {
      source: repo,
    });
    if (!ref) return null;
    const post = await hydrateSharedDocument(ref, {
      fetchRecord,
      getProfile,
      baseUrl: ATMOSPHERE_BLOG_URL,
    });
    if (!post) return null;
    return { id: ref.documentUri, data: { ...post } };
  },
};

export const eventFilters: Record<string, FilterFn> = {
  "community.lexicon.calendar.event": ({ value, did, rkey, repo }) =>
    !!parseEventRecord(value as Record<string, unknown>, {
      did,
      rkey,
      source: repo,
    }),
  "community.opensocial.sharedContent": ({ value, repo }) => {
    const ref = parseSharedEventRef(value as Record<string, unknown>, {
      source: repo,
    });
    return !!ref && ref.documentUri.startsWith("at://");
  },
};

export const eventDedupers: Record<string, DedupeFn> = {
  "community.lexicon.calendar.event": ({ uri }) => uri,
  "community.opensocial.sharedContent": ({ value }) => {
    const ref = parseSharedEventRef(value as Record<string, unknown>, {
      source: "",
    });
    return ref?.documentUri ?? null;
  },
};

export const eventTransformers: Record<string, TransformFn<Entry>> = {
  "community.lexicon.calendar.event": async ({ value, uri, did, rkey, repo }) => {
    const event = parseEventRecord(value as Record<string, unknown>, {
      did,
      rkey,
      source: repo,
    });
    return event ? { id: uri, data: { ...event } } : null;
  },
  "community.opensocial.sharedContent": async ({ value, repo, fetchRecord }) => {
    const ref = parseSharedEventRef(value as Record<string, unknown>, {
      source: repo,
    });
    if (!ref) return null;
    const event = await hydrateSharedEvent(ref, { fetchRecord });
    return event ? { id: ref.documentUri, data: { ...event } } : null;
  },
};
