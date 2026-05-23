#!/usr/bin/env node
// Resolve every community in src/data/communities.yml to its PDS and tally
// which lexicons (NSIDs) appear in each repo via com.atproto.repo.describeRepo.
//
// Usage:
//   node scripts/community-lexicons.mjs
//   node scripts/community-lexicons.mjs --json     # raw JSON report
//   node scripts/community-lexicons.mjs --prefix app.bsky.   # only NSIDs with prefix

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import yaml from "js-yaml";
import { IdResolver } from "@atproto/identity";

const __dirname = dirname(fileURLToPath(import.meta.url));
const YML = join(__dirname, "..", "src", "data", "communities.yml");

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const prefixArg = args.find((a) => a.startsWith("--prefix"));
const prefix = prefixArg?.includes("=")
  ? prefixArg.split("=")[1]
  : prefixArg
    ? args[args.indexOf(prefixArg) + 1]
    : undefined;

const idResolver = new IdResolver();

/** @typedef {{ name: string, handle: string }} Community */
/** @typedef {{ community: Community, did?: string, pds?: string, collections?: string[], error?: string }} Row */

function pdsFromDidDoc(doc) {
  const services = doc?.service ?? [];
  const svc = services.find(
    (s) =>
      s.id === "#atproto_pds" ||
      s.id?.endsWith("#atproto_pds") ||
      s.type === "AtprotoPersonalDataServer",
  );
  return typeof svc?.serviceEndpoint === "string" ? svc.serviceEndpoint : undefined;
}

/** @returns {Promise<Row>} */
async function inspect(community) {
  try {
    const did = await idResolver.handle.resolve(community.handle);
    if (!did) return { community, error: "handle did not resolve" };
    const doc = await idResolver.did.resolve(did);
    const pds = pdsFromDidDoc(doc);
    if (!pds) return { community, did, error: "no PDS in DID doc" };

    const url = `${pds}/xrpc/com.atproto.repo.describeRepo?repo=${encodeURIComponent(did)}`;
    const res = await fetch(url);
    if (!res.ok) return { community, did, pds, error: `describeRepo HTTP ${res.status}` };
    const body = await res.json();
    const collections = Array.isArray(body.collections) ? body.collections : [];
    return { community, did, pds, collections };
  } catch (err) {
    return { community, error: err instanceof Error ? err.message : String(err) };
  }
}

function tally(rows) {
  const counts = new Map();
  for (const row of rows) {
    if (!row.collections) continue;
    for (const nsid of row.collections) {
      if (prefix && !nsid.startsWith(prefix)) continue;
      counts.set(nsid, (counts.get(nsid) ?? 0) + 1);
    }
  }
  return { counts };
}

async function pMap(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const idx = i++;
      if (idx >= items.length) return;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}

function renderTable(rows, total) {
  const { counts } = tally(rows);
  const sorted = [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );

  const ok = rows.filter((r) => r.collections).length;
  const failed = rows.filter((r) => r.error);

  console.log(`Communities: ${total}   resolved: ${ok}   failed: ${failed.length}`);
  if (prefix) console.log(`Filter: NSIDs starting with "${prefix}"`);
  console.log();

  const widest = sorted.reduce((w, [n]) => Math.max(w, n.length), 8);
  console.log(`${"NSID".padEnd(widest)}  count  share`);
  console.log(`${"-".repeat(widest)}  -----  -----`);
  for (const [nsid, n] of sorted) {
    const pct = ok ? Math.round((n / ok) * 100) : 0;
    console.log(`${nsid.padEnd(widest)}  ${String(n).padStart(5)}  ${String(pct).padStart(3)}%`);
  }

  if (failed.length) {
    console.log("\nFailed:");
    for (const r of failed) {
      console.log(`  ${r.community.handle.padEnd(40)} ${r.error}`);
    }
  }

  // Bonus: show communities that publish nothing beyond the default app.bsky.* set.
  if (!prefix) {
    const interesting = rows
      .filter((r) => r.collections)
      .map((r) => {
        const beyondBsky = r.collections.filter(
          (n) => !n.startsWith("app.bsky.") && !n.startsWith("chat.bsky."),
        );
        return { handle: r.community.handle, beyondBsky };
      })
      .filter((x) => x.beyondBsky.length > 0)
      .sort((a, b) => b.beyondBsky.length - a.beyondBsky.length);

    if (interesting.length) {
      console.log("\nNon-bsky lexicons by community:");
      for (const x of interesting) {
        console.log(`  ${x.handle}`);
        for (const nsid of x.beyondBsky) console.log(`    - ${nsid}`);
      }
    }
  }
}

async function main() {
  const text = await readFile(YML, "utf8");
  /** @type {Community[]} */
  const communities = yaml.load(text);

  // Limit concurrency — running 23 fetches at once was flaking out the
  // IdResolver against handles served via .well-known/atproto-did.
  const rows = await pMap(communities, 5, inspect);

  if (asJson) {
    process.stdout.write(JSON.stringify(rows, null, 2) + "\n");
    return;
  }

  renderTable(rows, communities.length);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
