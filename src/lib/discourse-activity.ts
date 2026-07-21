import type { LiveLoader } from "astro/loaders";
import { z } from "astro/zod";

const webUrlSchema = z.url().refine((value) => {
  const protocol = new URL(value).protocol;
  return protocol === "http:" || protocol === "https:";
}, "Expected an HTTP(S) URL");

export const discourseActivityTopicSchema = z.object({
  id: z.string(),
  title: z.string(),
  url: webUrlSchema,
  excerpt: z.string().optional(),
  createdAt: z.date(),
  lastActiveAt: z.date(),
  postCount: z.number().int().nonnegative(),
  replyCount: z.number().int().nonnegative(),
  categoryId: z.number().int(),
  tags: z.array(z.string()),
  author: z.object({
    username: z.string(),
    displayName: z.string().optional(),
    avatarUrl: webUrlSchema.optional(),
  }),
});

export type DiscourseActivityTopic = z.infer<
  typeof discourseActivityTopicSchema
>;

export type DiscourseActivityPage = {
  topics: DiscourseActivityTopic[];
  pagination: {
    nextPageUrl?: string;
    perPage?: number;
  };
};

type DiscourseActivitySource =
  | { type: "latest" }
  | { type: "category"; slug: string; id: number }
  | { type: "tag"; tag: string };

interface FetchDiscourseActivityOptions {
  baseUrl: string;
  source?: DiscourseActivitySource;
  limit?: number;
  fetch?: typeof globalThis.fetch;
}

interface DiscourseActivityLoaderOptions
  extends FetchDiscourseActivityOptions {
  cacheTtlMs?: number;
  now?: () => number;
}

export class DiscourseActivityError extends Error {
  readonly code: "request-failed" | "invalid-response";
  readonly status?: number;

  constructor({
    message,
    code,
    status,
    cause,
  }: {
    message: string;
    code: "request-failed" | "invalid-response";
    status?: number;
    cause?: unknown;
  }) {
    super(message, { cause });
    this.name = "DiscourseActivityError";
    this.code = code;
    this.status = status;
  }
}

const discourseDateSchema = z.string().refine(
  (value) => !Number.isNaN(new Date(value).getTime()),
  "Expected a valid date",
).transform((value) => new Date(value));

const optionalNonEmptyStringSchema = z
  .string()
  .min(1)
  .optional()
  .catch(undefined);
const optionalDiscourseDateSchema = discourseDateSchema
  .optional()
  .catch(undefined);

const discourseUserDecorationSchema = z.object({
  name: optionalNonEmptyStringSchema,
  avatar_template: optionalNonEmptyStringSchema,
});

const discourseTopicDecorationSchema = z.object({
  excerpt: optionalNonEmptyStringSchema,
  bumped_at: optionalDiscourseDateSchema,
  last_posted_at: optionalDiscourseDateSchema,
});

const discoursePaginationSchema = z.object({
  more_topics_url: optionalNonEmptyStringSchema,
  per_page: z.number().int().positive().optional().catch(undefined),
});

const discoursePosterSchema = z.object({
  user_id: z.number().int(),
});

const discourseUserSchema = z.object({
  id: z.number().int(),
  username: z.string().min(1),
  // Decoration is parsed separately so it cannot reject user identity.
  name: z.unknown(),
  avatar_template: z.unknown(),
});

const discourseTopicSchema = z.object({
  id: z.number().int(),
  title: z.string().min(1),
  slug: z.string().min(1),
  created_at: discourseDateSchema,
  posts_count: z.number().int().nonnegative(),
  reply_count: z.number().int().nonnegative(),
  category_id: z.number().int(),
  // Decoration is parsed separately so it cannot reject the core topic.
  excerpt: z.unknown(),
  bumped_at: z.unknown(),
  last_posted_at: z.unknown(),
  tags: z.unknown(),
  posters: z.unknown(),
});

const discourseResponseSchema = z.object({
  // Optional decoration and pagination are normalized independently.
  users: z.unknown(),
  topic_list: z.object({
    topics: z.array(z.unknown()),
    more_topics_url: z.unknown(),
    per_page: z.unknown(),
  }),
});

type DiscourseTopic = z.infer<typeof discourseTopicSchema>;
type DiscourseUser = z.infer<typeof discourseUserSchema>;

function extractValidItems<T>(value: unknown, schema: z.ZodType<T>): T[] {
  const arrayResult = z.array(z.unknown()).safeParse(value);
  if (!arrayResult.success) return [];

  const validItems: T[] = [];
  for (const rawItem of arrayResult.data) {
    const itemResult = schema.safeParse(rawItem);
    if (itemResult.success) validItems.push(itemResult.data);
  }
  return validItems;
}

function normalizeAuthor({
  topic,
  users,
  baseUrl,
}: {
  topic: DiscourseTopic;
  users: Map<number, DiscourseUser>;
  baseUrl: URL;
}): DiscourseActivityTopic["author"] {
  const firstPoster = extractValidItems(
    topic.posters,
    discoursePosterSchema,
  )[0];
  const user = firstPoster ? users.get(firstPoster.user_id) : undefined;
  const decoration = discourseUserDecorationSchema.parse(user ?? {});
  const avatarHref = decoration.avatar_template?.replaceAll("{size}", "96");
  const avatarUrlResult =
    avatarHref && URL.canParse(avatarHref, baseUrl)
      ? webUrlSchema.safeParse(new URL(avatarHref, baseUrl).toString())
      : undefined;

  return {
    username: user?.username ?? "unknown",
    displayName: decoration.name,
    avatarUrl: avatarUrlResult?.success ? avatarUrlResult.data : undefined,
  };
}

function normalizeTopic({
  topic,
  users,
  baseUrl,
}: {
  topic: DiscourseTopic;
  users: Map<number, DiscourseUser>;
  baseUrl: URL;
}): DiscourseActivityTopic {
  const decoration = discourseTopicDecorationSchema.parse(topic);

  return {
    id: String(topic.id),
    title: topic.title,
    url: new URL(
      `/t/${encodeURIComponent(topic.slug)}/${topic.id}`,
      baseUrl,
    ).toString(),
    excerpt: decoration.excerpt,
    createdAt: topic.created_at,
    lastActiveAt:
      decoration.bumped_at ?? decoration.last_posted_at ?? topic.created_at,
    postCount: topic.posts_count,
    replyCount: topic.reply_count,
    categoryId: topic.category_id,
    tags: extractValidItems(topic.tags, z.string()),
    author: normalizeAuthor({ topic, users, baseUrl }),
  };
}

function sourcePath(source: DiscourseActivitySource): string {
  switch (source.type) {
    case "latest":
      return "/latest.json";
    case "category":
      return `/c/${encodeURIComponent(source.slug)}/${source.id}/l/latest.json`;
    case "tag":
      return `/tag/${encodeURIComponent(source.tag)}.json`;
    default:
      throw new TypeError("Unsupported Discourse activity source");
  }
}

function buildActivityUrl({
  baseUrl,
  source,
  limit,
}: {
  baseUrl: URL;
  source: DiscourseActivitySource;
  limit: number;
}): URL {
  const url = new URL(sourcePath(source), baseUrl);
  url.searchParams.set("order", "activity");
  url.searchParams.set("per_page", String(Math.min(100, limit * 2)));
  return url;
}

function normalizeDiscoursePage({
  payload,
  baseUrl,
  limit,
}: {
  payload: unknown;
  baseUrl: URL;
  limit: number;
}): DiscourseActivityPage {
  const responseResult = discourseResponseSchema.safeParse(payload);
  if (!responseResult.success) {
    throw new DiscourseActivityError({
      message: "Discourse activity response is malformed",
      code: "invalid-response",
      cause: responseResult.error,
    });
  }

  const response = responseResult.data;
  const users = new Map(
    extractValidItems(response.users, discourseUserSchema).map((user) => [
      user.id,
      user,
    ]),
  );
  const topics = response.topic_list.topics
    .flatMap((rawTopic): DiscourseActivityTopic[] => {
      const result = discourseTopicSchema.safeParse(rawTopic);
      return result.success
        ? [normalizeTopic({ topic: result.data, users, baseUrl })]
        : [];
    })
    .sort((a, b) => b.lastActiveAt.getTime() - a.lastActiveAt.getTime())
    .slice(0, limit);
  const pagination = discoursePaginationSchema.parse(response.topic_list);
  const nextPageUrlResult =
    pagination.more_topics_url &&
    URL.canParse(pagination.more_topics_url, baseUrl)
      ? webUrlSchema.safeParse(
          new URL(pagination.more_topics_url, baseUrl).toString(),
        )
      : undefined;

  return {
    topics,
    pagination: {
      nextPageUrl: nextPageUrlResult?.success
        ? nextPageUrlResult.data
        : undefined,
      perPage: pagination.per_page,
    },
  };
}

export async function fetchDiscourseActivity(
  options: FetchDiscourseActivityOptions,
): Promise<DiscourseActivityPage> {
  const baseUrl = new URL(webUrlSchema.parse(options.baseUrl));
  const limit = Math.max(1, Math.min(50, options.limit ?? 10));
  const url = buildActivityUrl({
    baseUrl,
    source: options.source ?? { type: "latest" },
    limit,
  });
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const response = await fetchImpl(url, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new DiscourseActivityError({
      message: `Discourse activity request failed with ${response.status}`,
      code: "request-failed",
      status: response.status,
    });
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (cause) {
    throw new DiscourseActivityError({
      message: "Discourse activity response is malformed",
      code: "invalid-response",
      cause,
    });
  }

  return normalizeDiscoursePage({
    payload,
    baseUrl,
    limit,
  });
}

export function createDiscourseActivityLoader(
  options: DiscourseActivityLoaderOptions,
): LiveLoader<Record<string, unknown>, { id: string }> {
  const cacheTtlMs = Math.max(0, options.cacheTtlMs ?? 1000 * 60 * 5);
  const now = options.now ?? Date.now;
  let cached:
    | { page: DiscourseActivityPage; expiresAt: number }
    | undefined;
  let pending: Promise<DiscourseActivityPage> | undefined;

  const load = async (): Promise<DiscourseActivityPage> => {
    if (cached && cached.expiresAt > now()) return cached.page;
    if (pending) return pending;

    pending = fetchDiscourseActivity(options)
      .then((page) => {
        cached = { page, expiresAt: now() + cacheTtlMs };
        return page;
      })
      .finally(() => {
        pending = undefined;
      });
    return pending;
  };

  return {
    name: "discourse-activity",
    async loadCollection() {
      try {
        const page = await load();
        return {
          entries: page.topics.map((topic) => ({
            id: topic.id,
            data: { ...topic },
          })),
        };
      } catch (error) {
        return {
          error: error instanceof Error ? error : new Error(String(error)),
        };
      }
    },
    async loadEntry({ filter }) {
      try {
        const page = await load();
        const topic = page.topics.find((entry) => entry.id === filter.id);
        return topic ? { id: topic.id, data: { ...topic } } : undefined;
      } catch (error) {
        return {
          error: error instanceof Error ? error : new Error(String(error)),
        };
      }
    },
  };
}
