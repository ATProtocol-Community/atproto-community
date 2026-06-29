import { asDatetimeString, isDidString } from "@atproto/lex";

import type { ShareCandidate } from "../community/share-candidates.js";
import {
  createRecord as createRecordMethod,
  sharedContent as sharedContentSchema,
} from "./generated/community/opensocial.js";
import { createSignedLexClient } from "./xrpc.js";

const DEFAULT_SERVICE = "https://api.opensocial.community";
export const SHARED_CONTENT_COLLECTION = "community.opensocial.sharedContent";

type CreateRecordBody = createRecordMethod.$defs.$InputBody;
type CreateRecordOutput = createRecordMethod.$defs.$OutputBody;

function createOpenSocialClient() {
  const appId = import.meta.env.OPENSOCIAL_APP_ID;
  if (!appId || appId.length === 0) {
    throw new Error(
      "OPENSOCIAL_APP_ID is not set; cannot sign opensocial requests",
    );
  }

  return createSignedLexClient({
    service: import.meta.env.OPENSOCIAL_SERVICE || DEFAULT_SERVICE,
    appId,
  });
}

function did(value: string, label: string) {
  if (isDidString(value)) return value;
  throw new Error(`${label} must be a valid DID`);
}

export async function shareContentWithCommunity(input: {
  communityDid: string;
  userDid: string;
  candidate: ShareCandidate;
}): Promise<CreateRecordOutput> {
  const record = sharedContentSchema.$build({
    type: input.candidate.kind,
    documentUri: input.candidate.uri,
    documentCid: input.candidate.cid,
    sharedBy: did(input.userDid, "userDid"),
    title: input.candidate.title,
    path: input.candidate.path,
    sharedAt: asDatetimeString(new Date().toISOString()),
    startsAt: input.candidate.kind === "event" && input.candidate.date
      ? asDatetimeString(input.candidate.date.toISOString())
      : undefined,
    endsAt: input.candidate.endsAt
      ? asDatetimeString(input.candidate.endsAt.toISOString())
      : undefined,
    location: input.candidate.location,
    mode: input.candidate.mode,
  });

  const body: CreateRecordBody = {
    communityDid: did(input.communityDid, "communityDid"),
    userDid: did(input.userDid, "userDid"),
    collection: SHARED_CONTENT_COLLECTION,
    record,
  };

  const res = await createOpenSocialClient().xrpc(createRecordMethod.main, {
    body,
  });
  return res.body;
}
