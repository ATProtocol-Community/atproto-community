import { AtpAgent, AtUri } from '@atproto/api';
import { DidResolver, MemoryCache, getPds } from '@atproto/identity';
import { isValidAtUri, type AtUriString } from '@atproto/syntax';

import { parseBlogPostRef } from './shared-content.js';
import { parseEventRecord } from './events.js';
import { resolveHandleToDid } from './identity.js';

const EVENT_COLLECTION = 'community.lexicon.calendar.event';
const DOCUMENT_COLLECTION = 'site.standard.document';

const didCache = new MemoryCache();
const didResolver = new DidResolver({ didCache });

export interface ShareCandidate {
  kind: 'event' | 'document';
  title: string;
  uri: AtUriString;
  cid: string;
  date?: Date;
  path?: string;
  endsAt?: Date;
  location?: string;
  mode?: 'in-person' | 'virtual' | 'hybrid';
}

export interface ShareCandidateList {
  repo: string;
  events: ShareCandidate[];
  documents: ShareCandidate[];
}

interface RepoRecord {
  uri: string;
  cid?: string;
  value: unknown;
}

export async function getShareCandidates(repoHandleOrDid: string): Promise<ShareCandidateList> {
  const did = await resolveHandleToDid(repoHandleOrDid);
  const agent = await createRepoAgent(did);

  const [eventRecords, documentRecords] = await Promise.all([
    listRecords(agent, did, EVENT_COLLECTION),
    listRecords(agent, did, DOCUMENT_COLLECTION),
  ]);

  return {
    repo: repoHandleOrDid,
    events: eventRecords
      .map((record) => toEventCandidate(record))
      .filter((candidate): candidate is ShareCandidate => candidate !== null)
      .sort(sortCandidates),
    documents: documentRecords
      .map((record) => toDocumentCandidate(record, did))
      .filter((candidate): candidate is ShareCandidate => candidate !== null)
      .sort(sortCandidates),
  };
}

export async function getShareCandidateByUri(
  repoHandleOrDid: string,
  uri: string,
): Promise<ShareCandidate | null> {
  const did = await resolveHandleToDid(repoHandleOrDid);
  let parsed: AtUri;
  try {
    parsed = new AtUri(uri);
  } catch {
    return null;
  }

  if (parsed.host !== did) return null;
  if (parsed.collection !== EVENT_COLLECTION && parsed.collection !== DOCUMENT_COLLECTION) {
    return null;
  }

  const agent = await createRepoAgent(did);
  const response = await agent.com.atproto.repo.getRecord({
    repo: did,
    collection: parsed.collection,
    rkey: parsed.rkey,
  });
  const record: RepoRecord = {
    uri: response.data.uri,
    cid: response.data.cid,
    value: response.data.value,
  };

  return parsed.collection === EVENT_COLLECTION
    ? toEventCandidate(record)
    : toDocumentCandidate(record, did);
}

async function createRepoAgent(did: string): Promise<AtpAgent> {
  const doc = await didResolver.resolve(did);
  const pds = doc ? getPds(doc) : undefined;
  if (!pds) throw new Error(`Could not resolve PDS for ${did}`);
  return new AtpAgent({ service: pds });
}

async function listRecords(
  agent: AtpAgent,
  repo: string,
  collection: string,
): Promise<RepoRecord[]> {
  const records: RepoRecord[] = [];
  let cursor: string | undefined;

  do {
    const response = await agent.com.atproto.repo.listRecords({
      repo,
      collection,
      limit: 100,
      cursor,
    });
    records.push(...response.data.records);
    cursor = response.data.cursor;
  } while (cursor);

  return records;
}

function toEventCandidate(record: RepoRecord): ShareCandidate | null {
  if (!record.cid || !isValidAtUri(record.uri)) return null;
  if (!isRecordValue(record.value)) return null;

  try {
    const parsed = new AtUri(record.uri);
    const event = parseEventRecord(record.value, {
      did: parsed.host,
      rkey: parsed.rkey,
      source: parsed.host,
    });
    if (!event) return null;

    return {
      kind: 'event',
      title: event.name || 'Untitled event',
      uri: record.uri,
      cid: record.cid,
      date: event.startsAt,
      endsAt: event.endsAt,
      location: event.location,
      mode: event.mode === 'inperson' ? 'in-person' : event.mode,
    };
  } catch {
    return null;
  }
}

function toDocumentCandidate(record: RepoRecord, did: string): ShareCandidate | null {
  if (!record.cid || !isValidAtUri(record.uri)) return null;
  if (!isRecordValue(record.value)) return null;

  try {
    const parsed = new AtUri(record.uri);
    const post = parseBlogPostRef(record.value, {
      did,
      rkey: parsed.rkey,
    });
    if (!post) return null;

    return {
      kind: 'document',
      title: post.title || 'Untitled document',
      uri: record.uri,
      cid: record.cid,
      date: post.publishedAt,
      path: post.path,
    };
  } catch {
    return null;
  }
}

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function sortCandidates(a: ShareCandidate, b: ShareCandidate): number {
  return (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0);
}
