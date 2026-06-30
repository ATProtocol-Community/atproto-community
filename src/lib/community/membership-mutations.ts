import { type JoinOutcomeCode } from "./join-status";
import {
  ensureUserMembershipRecord,
  getMembership,
  joinCommunity,
  leaveCommunity,
} from "../opensocial/membership";
import { OpenSocialCommunityError } from "../opensocial/client";

type LoggedInUser = NonNullable<App.Locals["loggedInUser"]>;

export async function runJoin(
  loggedInUser: LoggedInUser,
  communityDid: string,
): Promise<JoinOutcomeCode> {
  try {
    const membership = await getMembership({
      communityDid,
      userDid: loggedInUser.did,
    });
    if (membership.isMember || membership.isAdmin) return "already";
    const membershipRecord = await ensureUserMembershipRecord({
      loggedInUser,
      communityDid,
    });
    const result = await joinCommunity({
      communityDid,
      userDid: loggedInUser.did,
      membershipCid: membershipRecord.cid,
    });
    return result.status === "pending" ? "pending" : "ok";
  } catch (err) {
    if (err instanceof OpenSocialCommunityError) {
      const outcome = joinOutcomeFromError(err);
      if (outcome) return outcome;
    }
    throw err;
  }
}

export async function runLeave(
  loggedInUser: LoggedInUser,
  communityDid: string,
): Promise<JoinOutcomeCode> {
  try {
    await leaveCommunity({ communityDid, userDid: loggedInUser.did });
    return "left";
  } catch (err) {
    if (err instanceof OpenSocialCommunityError) {
      const outcome = leaveOutcomeFromError(err);
      if (outcome) return outcome;
    }
    throw err;
  }
}

function joinOutcomeFromError(err: OpenSocialCommunityError): JoinOutcomeCode | null {
  switch (err.code) {
    case "AlreadyMember":
      return "already";
    case "AlreadyPending":
      return "pending";
    default:
      return null;
  }
}

function leaveOutcomeFromError(err: OpenSocialCommunityError): JoinOutcomeCode | null {
  switch (err.code) {
    case "NotMember":
      return "not-member";
    case "CannotLeaveAsAdmin":
      return "admin-block";
    default:
      return null;
  }
}
