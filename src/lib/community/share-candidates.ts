import { Agent, AtUri } from '@atproto/api';
import { isValidAtUri, type AtUriString } from '@atproto/syntax';

import { parseBlogPostRef, resolveStandardDocumentUrl } from './shared-content.js';
import { parseEventRecord } from './events.js';
import {
  getRepoRecordByUri,
  openRepo,
  resolveHandleToDid,
  type RepoRecord,
} from './repo.js';

const EVENT_COLLECTION = 'community.lexicon.calendar.event';
const DOCUMENT_COLLECTION = 'site.standard.document';
const MAX_SHARE_CANDIDATE_PAGES = 10;

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
  previewUrl?: string;
}

export interface ShareCandidateList {
  repo: string;
  events: ShareCandidate[];
  documents: ShareCandidate[];
}

async function fetchRecordValue(atUri: string): Promise<Record<string, unknown> | null> {
  const record = await getRepoRecordByUri(atUri);
  return record && isRecordValue(record.value) ? record.value : null;
}

export async function getShareCandidates(repoHandleOrDid: string): Promise<ShareCandidateList> {
  const { agent, did } = await openRepo({ handleOrDid: repoHandleOrDid });

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
    documents: (await Promise.all(documentRecords.map((record) => toDocumentCandidate(record, did))))
      .filter((candidate): candidate is ShareCandidate => candidate !== null)
      .sort(sortCandidates),
  };
}

export async function getShareCandidateByUri(
  repoHandleOrDid: string,
  uri: string,
): Promise<ShareCandidate | null> {
  const did = await resolveHandleToDid({ handleOrDid: repoHandleOrDid });
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

  const record = await getRepoRecordByUri(uri);
  if (!record) return null;

  return parsed.collection === EVENT_COLLECTION
    ? toEventCandidate(record)
    : toDocumentCandidate(record, did);
}

async function listRecords(
  agent: Agent,
  repo: string,
  collection: string,
): Promise<RepoRecord[]> {
  const records: RepoRecord[] = [];
  let pageCount = 0;
  let cursor: string | undefined;

  do {
    pageCount += 1;
    const response = await agent.com.atproto.repo.listRecords({
      repo,
      collection,
      limit: 100,
      cursor,
    });
    records.push(...response.data.records);
    cursor = response.data.cursor;
  } while (cursor && pageCount < MAX_SHARE_CANDIDATE_PAGES);

  if (cursor) {
    console.warn(
      `Stopped listing ${collection} for ${repo} after ${MAX_SHARE_CANDIDATE_PAGES} pages`,
    );
  }

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
      previewUrl: `https://smokesignal.events/${parsed.host}/${parsed.rkey}`,
    };
  } catch {
    return null;
  }
}

async function toDocumentCandidate(record: RepoRecord, did: string): Promise<ShareCandidate | null> {
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
      previewUrl: await resolveStandardDocumentUrl(
        record.value,
        did,
        parsed.rkey,
        fetchRecordValue,
      ),
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
