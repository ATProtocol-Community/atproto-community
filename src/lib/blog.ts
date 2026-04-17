/**
 * Fetch standard.site documents directly from ATProto via XRPC.
 * This bypasses the astro-standard-site loader which has strict schema
 * validation that rejects documents with timezone offsets like +00:00.
 */

export interface BlogPost {
  id: string;
  uri: string;
  title: string;
  site: string;
  publishedAt: Date;
  path?: string;
  url?: string;
  description?: string;
  textContent?: string;
  tags: string[];
}

const COLLECTION = 'site.standard.document';

interface RawDocument {
  $type: string;
  title?: string;
  site?: string;
  publishedAt?: string;
  updatedAt?: string;
  path?: string;
  description?: string;
  textContent?: string;
  tags?: string[];
  content?: unknown;
  [key: string]: unknown;
}

/**
 * Fetch blog posts from an ATProto account's PDS.
 */
export async function fetchBlogPosts(config: {
  handle: string;
  pds: string;
  publication?: string;
  limit?: number;
}): Promise<BlogPost[]> {
  const { handle, pds, publication, limit = 100 } = config;

  // Resolve handle to DID
  let did = handle;
  if (!did.startsWith('did:')) {
    const res = await fetch(
      `https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`
    );
    if (!res.ok) throw new Error(`Failed to resolve handle ${handle}: ${res.status}`);
    const data = await res.json();
    did = data.did;
  }

  // Fetch all documents
  const posts: BlogPost[] = [];
  let cursor: string | undefined;

  do {
    const params = new URLSearchParams({
      repo: did,
      collection: COLLECTION,
      limit: String(Math.min(limit, 100)),
    });
    if (cursor) params.set('cursor', cursor);

    const res = await fetch(`${pds}/xrpc/com.atproto.repo.listRecords?${params}`);
    if (!res.ok) throw new Error(`listRecords failed: ${res.status}`);

    const data = await res.json();

    for (const record of data.records as Array<{ uri: string; cid: string; value: RawDocument }>) {
      const v = record.value;

      // Skip if no title
      if (!v.title) continue;

      // Filter to specific publication if requested
      if (publication && v.site !== publication) continue;

      // Parse the date tolerantly (handles +00:00, Z, and other formats)
      let publishedAt: Date;
      try {
        publishedAt = new Date(v.publishedAt ?? '');
        if (isNaN(publishedAt.getTime())) continue;
      } catch {
        continue;
      }

      const rkey = record.uri.split('/').pop() ?? '';

      posts.push({
        id: rkey,
        uri: record.uri,
        title: v.title,
        site: v.site ?? '',
        publishedAt,
        path: v.path,
        url: v.path ? `https://blog.atmosphere.community${v.path}` : undefined,
        description: v.description,
        textContent: v.textContent,
        tags: v.tags ?? [],
      });
    }

    cursor = data.cursor;
    if (posts.length >= limit) break;
  } while (cursor);

  return posts;
}
