import assert from "node:assert/strict";
import test from "node:test";

import {
  createDiscourseActivityLoader,
  DiscourseActivityError,
  fetchDiscourseActivity,
} from "./discourse-activity.js";

function topic({
  id,
  lastPostedDay,
  bumpedDay = lastPostedDay,
  userId = 42,
}: {
  id: number;
  lastPostedDay: number;
  bumpedDay?: number;
  userId?: number;
}) {
  return {
    id,
    title: `Topic ${id}`,
    slug: `topic-${id}`,
    posts_count: id + 1,
    reply_count: id,
    created_at: "2026-07-01T12:00:00.000Z",
    last_posted_at: `2026-07-${String(lastPostedDay).padStart(2, "0")}T12:00:00.000Z`,
    bumped_at: `2026-07-${String(bumpedDay).padStart(2, "0")}T12:00:00.000Z`,
    category_id: 4,
    tags: ["working-groups"],
    posters: [
      {
        description: "Original Poster",
        user_id: userId,
      },
    ],
  };
}

test("fetchDiscourseActivity returns the ten most recently active topics", async () => {
  const requested: string[] = [];
  const response = {
    users: [
      {
        id: 42,
        username: "member.example",
        name: "Member Example",
        avatar_template: "/user_avatar/member/{size}/1.png",
      },
    ],
    topic_list: {
      more_topics_url: "/latest?page=1",
      per_page: 20,
      topics: Array.from({ length: 12 }, (_, index) =>
        topic({ id: index + 1, lastPostedDay: index + 1 }),
      ),
    },
  };

  const page = await fetchDiscourseActivity({
    baseUrl: "https://forum.example",
    limit: 10,
    fetch: async (input) => {
      requested.push(input.toString());
      return Response.json(response);
    },
  });

  assert.deepEqual(
    page.topics.map((entry) => entry.id),
    ["12", "11", "10", "9", "8", "7", "6", "5", "4", "3"],
  );
  assert.equal(page.topics[0]?.url, "https://forum.example/t/topic-12/12");
  assert.equal(page.topics[0]?.author.displayName, "Member Example");
  assert.equal(page.topics[0]?.author.avatarUrl, "https://forum.example/user_avatar/member/96/1.png");
  assert.deepEqual(page.pagination, {
    nextPageUrl: "https://forum.example/latest?page=1",
    perPage: 20,
  });
  assert.equal(requested.length, 1);
  assert.match(requested[0] ?? "", /\/latest\.json\?/);
  assert.match(requested[0] ?? "", /per_page=20/);
});

test("fetchDiscourseActivity orders and timestamps topics by bumped activity", async () => {
  const { bumped_at: _, ...topicWithoutBumpedAt } = topic({
    id: 3,
    lastPostedDay: 7,
  });
  const page = await fetchDiscourseActivity({
    baseUrl: "https://forum.example",
    fetch: async () =>
      Response.json({
        users: [],
        topic_list: {
          topics: [
            topic({ id: 1, lastPostedDay: 20, bumpedDay: 5 }),
            topic({ id: 2, lastPostedDay: 10, bumpedDay: 9 }),
            topicWithoutBumpedAt,
          ],
        },
      }),
  });

  assert.deepEqual(page.topics.map((entry) => entry.id), ["2", "3", "1"]);
  assert.equal(
    page.topics[0]?.lastActiveAt.toISOString(),
    "2026-07-09T12:00:00.000Z",
  );
});

test("fetchDiscourseActivity keeps static avatar paths", async () => {
  const page = await fetchDiscourseActivity({
    baseUrl: "https://forum.example",
    fetch: async () =>
      Response.json({
        users: [
          {
            id: -1,
            username: "system",
            avatar_template: "/uploads/default/original/avatar.png",
          },
        ],
        topic_list: {
          topics: [topic({ id: 1, lastPostedDay: 1, userId: -1 })],
        },
      }),
  });

  assert.equal(
    page.topics[0]?.author.avatarUrl,
    "https://forum.example/uploads/default/original/avatar.png",
  );
});

test("fetchDiscourseActivity resolves absolute avatar templates", async () => {
  const page = await fetchDiscourseActivity({
    baseUrl: "https://forum.example",
    fetch: async () =>
      Response.json({
        users: [
          {
            id: 42,
            username: "external-avatar",
            avatar_template:
              "https://avatars.discourse-cdn.com/v4/letter/e/{size}/1.png",
          },
        ],
        topic_list: {
          topics: [topic({ id: 1, lastPostedDay: 1 })],
        },
      }),
  });

  assert.equal(
    page.topics[0]?.author.avatarUrl,
    "https://avatars.discourse-cdn.com/v4/letter/e/96/1.png",
  );
});

test("fetchDiscourseActivity rejects non-web avatar schemes", async () => {
  const page = await fetchDiscourseActivity({
    baseUrl: "https://forum.example",
    fetch: async () =>
      Response.json({
        users: [
          {
            id: 42,
            username: "invalid-avatar",
            avatar_template: "javascript:alert(1)",
          },
        ],
        topic_list: {
          topics: [topic({ id: 1, lastPostedDay: 1 })],
        },
      }),
  });

  assert.equal(page.topics[0]?.author.avatarUrl, undefined);
});

test("fetchDiscourseActivity keeps users with empty optional fields", async () => {
  const rawTopic = {
    ...topic({ id: 1, lastPostedDay: 1 }),
    excerpt: "",
  };
  const page = await fetchDiscourseActivity({
    baseUrl: "https://forum.example",
    fetch: async () =>
      Response.json({
        users: [
          {
            id: 42,
            username: "member.example",
            name: "",
            avatar_template: "",
          },
        ],
        topic_list: { topics: [rawTopic] },
      }),
  });

  assert.equal(page.topics[0]?.author.username, "member.example");
  assert.equal(page.topics[0]?.author.displayName, undefined);
  assert.equal(page.topics[0]?.author.avatarUrl, undefined);
  assert.equal(page.topics[0]?.excerpt, undefined);
});

test("fetchDiscourseActivity falls back from malformed optional dates", async () => {
  const page = await fetchDiscourseActivity({
    baseUrl: "https://forum.example",
    fetch: async () =>
      Response.json({
        users: [],
        topic_list: {
          topics: [
            {
              ...topic({ id: 8, lastPostedDay: 8 }),
              bumped_at: "not-a-date",
            },
          ],
        },
      }),
  });

  assert.equal(
    page.topics[0]?.lastActiveAt.toISOString(),
    "2026-07-08T12:00:00.000Z",
  );
});

test("fetchDiscourseActivity keeps valid optional array entries", async () => {
  const rawTopic = topic({ id: 1, lastPostedDay: 1 });
  const page = await fetchDiscourseActivity({
    baseUrl: "https://forum.example",
    fetch: async () =>
      Response.json({
        users: [
          {
            id: 42,
            username: "member.example",
          },
        ],
        topic_list: {
          topics: [
            {
              ...rawTopic,
              tags: ["working-groups", 42],
              posters: [
                { description: 42, user_id: "invalid" },
                ...rawTopic.posters,
              ],
            },
          ],
        },
      }),
  });

  assert.deepEqual(page.topics[0]?.tags, ["working-groups"]);
  assert.equal(page.topics[0]?.author.username, "member.example");
});

test("fetchDiscourseActivity keeps poster identity when description is malformed", async () => {
  const page = await fetchDiscourseActivity({
    baseUrl: "https://forum.example",
    fetch: async () =>
      Response.json({
        users: [{ id: 42, username: "member.example" }],
        topic_list: {
          topics: [
            {
              ...topic({ id: 1, lastPostedDay: 1 }),
              posters: [{ description: 42, user_id: 42 }],
            },
          ],
        },
      }),
  });

  assert.equal(page.topics[0]?.author.username, "member.example");
});

test("fetchDiscourseActivity gives topics independent tag arrays", async () => {
  const firstWithoutTags = {
    ...topic({ id: 1, lastPostedDay: 1 }),
    tags: undefined,
  };
  const secondWithoutTags = {
    ...topic({ id: 2, lastPostedDay: 2 }),
    tags: undefined,
  };

  const page = await fetchDiscourseActivity({
    baseUrl: "https://forum.example",
    fetch: async () =>
      Response.json({
        users: [],
        topic_list: { topics: [firstWithoutTags, secondWithoutTags] },
      }),
  });

  page.topics[0]?.tags.push("local-change");
  assert.deepEqual(page.topics[1]?.tags, []);
});

test("fetchDiscourseActivity selects category and tag endpoints", async (t) => {
  const emptyResponse = {
    users: [],
    topic_list: { topics: [] },
  };

  await t.test("category", async () => {
    let requested = "";
    const page = await fetchDiscourseActivity({
      baseUrl: "https://forum.example",
      source: { type: "category", slug: "working-groups", id: 12 },
      fetch: async (input) => {
        requested = input.toString();
        return Response.json(emptyResponse);
      },
    });
    assert.deepEqual(page.pagination, {
      nextPageUrl: undefined,
      perPage: undefined,
    });
    assert.equal(
      new URL(requested).pathname,
      "/c/working-groups/12/l/latest.json",
    );
  });

  await t.test("tag", async () => {
    let requested = "";
    await fetchDiscourseActivity({
      baseUrl: "https://forum.example",
      source: { type: "tag", tag: "groups & governance" },
      fetch: async (input) => {
        requested = input.toString();
        return Response.json(emptyResponse);
      },
    });
    assert.equal(
      new URL(requested).pathname,
      "/tag/groups%20%26%20governance.json",
    );
  });
});

test("fetchDiscourseActivity rejects non-web base URLs before requesting", async () => {
  let requested = false;

  await assert.rejects(
    fetchDiscourseActivity({
      baseUrl: "ftp://forum.example",
      fetch: async () => {
        requested = true;
        return Response.json({ topic_list: { topics: [] } });
      },
    }),
    Error,
  );
  assert.equal(requested, false);
});

test("createDiscourseActivityLoader reuses a bounded result and loads by topic id", async () => {
  let requestCount = 0;
  const loader = createDiscourseActivityLoader({
    baseUrl: "https://forum.example",
    fetch: async () => {
      requestCount += 1;
      return Response.json({
        users: [],
        topic_list: { topics: [topic({ id: 7, lastPostedDay: 7 })] },
      });
    },
  });

  const first = await loader.loadCollection({ collection: "forum" });
  const second = await loader.loadCollection({ collection: "forum" });
  const entry = await loader.loadEntry({
    collection: "forum",
    filter: { id: "7" },
  });

  assert.equal("error" in first, false);
  assert.equal("error" in second, false);
  assert.equal("error" in entry!, false);
  if ("entries" in first) assert.equal(first.entries[0]?.id, "7");
  if (entry && "data" in entry) assert.equal(entry.data.title, "Topic 7");
  assert.equal(requestCount, 1);
});

test("fetchDiscourseActivity reports unsuccessful and malformed responses", async (t) => {
  await t.test("unsuccessful response", async () => {
    await assert.rejects(
      fetchDiscourseActivity({
        baseUrl: "https://forum.example",
        fetch: async () => new Response(null, { status: 429 }),
      }),
      (error: unknown) =>
        error instanceof DiscourseActivityError &&
        error.code === "request-failed" &&
        error.status === 429,
    );
  });

  await t.test("skips a malformed topic without hiding valid topics", async () => {
    const page = await fetchDiscourseActivity({
      baseUrl: "https://forum.example",
      fetch: async () =>
        Response.json({
          users: [],
          topic_list: {
            topics: [
              topic({ id: 7, lastPostedDay: 7 }),
              {
                ...topic({ id: 8, lastPostedDay: 8 }),
                created_at: "not-a-date",
              },
            ],
          },
        }),
    });

    assert.deepEqual(page.topics.map((entry) => entry.id), ["7"]);
  });

  await t.test("malformed response", async () => {
    await assert.rejects(
      fetchDiscourseActivity({
        baseUrl: "https://forum.example",
        fetch: async () => Response.json({ topics: [] }),
      }),
      (error: unknown) =>
        error instanceof DiscourseActivityError &&
        error.code === "invalid-response",
    );
  });

  await t.test("non-JSON response", async () => {
    await assert.rejects(
      fetchDiscourseActivity({
        baseUrl: "https://forum.example",
        fetch: async () => new Response("<html>maintenance</html>"),
      }),
      (error: unknown) =>
        error instanceof DiscourseActivityError &&
        error.code === "invalid-response" &&
        error.cause instanceof SyntaxError,
    );
  });
});
