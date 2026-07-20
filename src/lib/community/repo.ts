// Remove this file once `@fujocoded/astro-atproto-loader` ships
// `resolveHandleToDid` and a general record-reading seam. Until then, this is
// the local copy used by the community directory.
import { Agent, AtUri } from '@atproto/api';
import {
  DidResolver,
  HandleResolver,
  MemoryCache,
  getHandle,
  getPds,
} from '@atproto/identity';

const didResolver = new DidResolver({ didCache: new MemoryCache() });
const handleResolver = new HandleResolver({});

export interface RepoRecord {
  uri: string;
  cid?: string;
  value: unknown;
}

export async function resolveHandleToDid({
  handleOrDid,
}: {
  handleOrDid: string;
}): Promise<string> {
  if (handleOrDid.startsWith('did:')) return handleOrDid;

  const normalized = handleOrDid.toLowerCase().replace(/^@/, '');
  const did = await handleResolver.resolve(normalized);
  if (!did) {
    throw new Error(`Could not resolve handle "${handleOrDid}" to a DID`);
  }

  const doc = await didResolver.resolve(did);
  if (!doc) {
    throw new Error(`Could not resolve DID document for "${did}"`);
  }
  const docHandle = getHandle(doc);
  if (!docHandle || docHandle.toLowerCase() !== normalized) {
    throw new Error(
      `Handle verification failed: "${handleOrDid}" does not match DID document handle "${docHandle ?? 'none'}"`,
    );
  }

  return did;
}

export async function openRepo(
  {
    handleOrDid,
  }: {
    handleOrDid: string;
  },
): Promise<{ agent: Agent; did: string }> {
  const did = await resolveHandleToDid({ handleOrDid });
  const doc = await didResolver.resolve(did);
  const pds = doc ? getPds(doc) : undefined;
  if (!pds) throw new Error(`Could not resolve PDS for ${did}`);

  return { agent: new Agent(new URL(pds)), did };
}

export async function getRepoRecordByUri(
  uri: string,
): Promise<RepoRecord | null> {
  let parsed: AtUri;
  try {
    parsed = new AtUri(uri);
  } catch {
    return null;
  }

  const { agent, did } = await openRepo({ handleOrDid: parsed.host });
  const response = await agent.com.atproto.repo.getRecord({
    repo: did,
    collection: parsed.collection,
    rkey: parsed.rkey,
  });
  return {
    uri: response.data.uri,
    cid: response.data.cid,
    value: response.data.value,
  };
}
