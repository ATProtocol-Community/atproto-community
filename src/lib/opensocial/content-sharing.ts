import { asDatetimeString } from "@atproto/lex";

import type { ShareCandidate } from "../community/share-candidates.js";
import {
  createRecord as createRecordMethod,
  deleteRecord as deleteRecordMethod,
  sharedContent as sharedContentSchema,
} from "./generated/community/opensocial.js";
import { createOpenSocialClient, did, xrpc } from "./client.js";

export const SHARED_CONTENT_COLLECTION = "community.opensocial.sharedContent";

type CreateRecordBody = createRecordMethod.$defs.$InputBody;
type CreateRecordOutput = createRecordMethod.$defs.$OutputBody;
type DeleteRecordBody = deleteRecordMethod.$defs.$InputBody;
type DeleteRecordOutput = deleteRecordMethod.$defs.$OutputBody;

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

  const res = await xrpc(() =>
    createOpenSocialClient().xrpc(createRecordMethod.main, {
      body,
    }),
  );
  return res.body;
}

export async function unshareContentWithCommunity(input: {
  communityDid: string;
  userDid: string;
  shareRecordRkey: string;
}): Promise<DeleteRecordOutput> {
  const body: DeleteRecordBody = {
    communityDid: did(input.communityDid, "communityDid"),
    userDid: did(input.userDid, "userDid"),
    collection: SHARED_CONTENT_COLLECTION,
    rkey: input.shareRecordRkey,
  };

  const res = await xrpc(() =>
    createOpenSocialClient().xrpc(deleteRecordMethod.main, {
      body,
    }),
  );
  return res.body;
}
