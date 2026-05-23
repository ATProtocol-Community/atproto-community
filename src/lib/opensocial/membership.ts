import { TID } from "@atproto/common-web";
import { XrpcError, asDatetimeString, isDidString } from "@atproto/lex";
import { getLoggedInAgent } from "@fujocoded/authproto/helpers";

import {
  getPermissions as getPermissionsMethod,
  joinCommunity as joinCommunityMethod,
  leaveCommunity as leaveCommunityMethod,
  membership as membershipSchema,
} from "./generated/community/opensocial.js";
import { createSignedLexClient } from "./xrpc.js";

export const MEMBERSHIP_COLLECTION = "community.opensocial.membership";
const DEFAULT_SERVICE = "https://api.opensocial.community";

type LoggedInUser = NonNullable<App.Locals["loggedInUser"]>;
type LoggedInAgent = NonNullable<Awaited<ReturnType<typeof getLoggedInAgent>>>;
type JoinCommunityBody = joinCommunityMethod.$defs.$InputBody;
type JoinCommunityOutput = joinCommunityMethod.$defs.$OutputBody;

interface MembershipState {
  /** True when the user has any role in the community (member, admin, ...). */
  isMember: boolean;
  /** Raw roles returned by the appview, useful for admin/moderator UI. */
  roles: string[];
}

interface StrongRef {
  uri: string;
  cid: string;
}

interface MembershipRecordInput {
  loggedInUser: LoggedInUser;
  communityDid: string;
}

export class OpenSocialCommunityError extends Error {
  constructor(
    public readonly status: number,
    /** XRPC error name (e.g. "AlreadyMember") when the response carried one. */
    public readonly code: string | null,
    message: string,
  ) {
    super(message);
    this.name = "OpenSocialCommunityError";
  }
}

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

async function requireLoggedInAgent(
  loggedInUser: LoggedInUser,
): Promise<LoggedInAgent> {
  const agent = await getLoggedInAgent(loggedInUser);
  if (!agent) {
    throw new Error("Not logged in");
  }
  return agent;
}

async function findMembershipRecord(
  agent: LoggedInAgent,
  { loggedInUser, communityDid }: MembershipRecordInput,
): Promise<StrongRef | null> {
  let cursor: string | undefined;
  do {
    const response = await agent.com.atproto.repo.listRecords({
      repo: loggedInUser.did,
      collection: MEMBERSHIP_COLLECTION,
      limit: 100,
      cursor,
    });

    for (const record of response.data.records) {
      const parsed = membershipSchema.$safeParse(record.value);
      if (!parsed.success || parsed.value.community !== communityDid) continue;
      return { uri: record.uri, cid: record.cid };
    }

    cursor = response.data.cursor;
  } while (cursor);

  return null;
}

/**
 * Reads the caller-supplied user's roles in a community via getPermissions.
 * An empty `roles` array means "not a member". Distinct from a pending-approval
 * state, which the appview surfaces only when attempting to join.
 */
export async function getMembership(input: {
  communityDid: string;
  userDid: string;
}): Promise<MembershipState> {
  const res = await xrpc(() =>
    createOpenSocialClient().xrpc(getPermissionsMethod.main, {
      params: {
        communityDid: did(input.communityDid, "communityDid"),
        userDid: did(input.userDid, "userDid"),
      },
    }),
  );
  const roles = res.body.userRoles;
  return { isMember: roles.length > 0, roles };
}

export async function joinCommunity(
  input: {
    communityDid: string;
    userDid: string;
    membershipCid?: string;
  },
): Promise<JoinCommunityOutput> {
  const body: JoinCommunityBody =
    input.membershipCid === undefined
      ? {
          communityDid: did(input.communityDid, "communityDid"),
          userDid: did(input.userDid, "userDid"),
        }
      : {
          communityDid: did(input.communityDid, "communityDid"),
          userDid: did(input.userDid, "userDid"),
          membershipCid: input.membershipCid,
        };

  const res = await xrpc(() =>
    createOpenSocialClient().xrpc(joinCommunityMethod.main, { body }),
  );
  return res.body;
}

export async function leaveCommunity(input: {
  communityDid: string;
  userDid: string;
}): Promise<void> {
  await xrpc(() =>
    createOpenSocialClient().xrpc(leaveCommunityMethod.main, {
      body: {
        communityDid: did(input.communityDid, "communityDid"),
        userDid: did(input.userDid, "userDid"),
      },
    }),
  );
}

export async function ensureUserMembershipRecord(
  input: MembershipRecordInput,
): Promise<StrongRef> {
  const { loggedInUser, communityDid } = input;
  const agent = await requireLoggedInAgent(loggedInUser);
  const existing = await findMembershipRecord(agent, input);
  if (existing) return existing;

  const record = membershipSchema.$build({
    community: did(communityDid, "communityDid"),
    joinedAt: asDatetimeString(new Date().toISOString()),
  });

  const response = await agent.com.atproto.repo.putRecord({
    repo: loggedInUser.did,
    collection: MEMBERSHIP_COLLECTION,
    rkey: TID.nextStr(),
    record,
    validate: false,
  });

  return {
    uri: response.data.uri,
    cid: response.data.cid,
  };
}

async function xrpc<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (err) {
    throw toOpenSocialCommunityError(err);
  }
}

function toOpenSocialCommunityError(err: unknown): OpenSocialCommunityError {
  if (err instanceof OpenSocialCommunityError) return err;
  if (err instanceof XrpcError) {
    const downstream = err.toDownstreamError();
    return new OpenSocialCommunityError(
      downstream.status,
      downstream.body.error,
      downstream.body.message || downstream.body.error,
    );
  }
  throw err;
}
