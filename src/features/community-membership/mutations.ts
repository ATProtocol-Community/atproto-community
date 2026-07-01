import {
  ensureUserMembershipRecord,
  getMembership,
  joinCommunity,
  leaveCommunity,
} from "../../lib/opensocial/membership";
import { OpenSocialCommunityError } from "../../lib/opensocial/client";
import { type JoinOutcomeCode } from "./notice";

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
    if (membership.isMember || membership.isAdmin) {
      return "already";
    }

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
  } catch (error) {
    if (error instanceof OpenSocialCommunityError) {
      const outcome = joinOutcomeFromError(error);
      if (outcome) {
        return outcome;
      }
    }
    throw error;
  }
}

export async function runLeave(
  loggedInUser: LoggedInUser,
  communityDid: string,
): Promise<JoinOutcomeCode> {
  try {
    await leaveCommunity({ communityDid, userDid: loggedInUser.did });
    return "left";
  } catch (error) {
    if (error instanceof OpenSocialCommunityError) {
      const outcome = leaveOutcomeFromError(error);
      if (outcome) {
        return outcome;
      }
    }
    throw error;
  }
}

function joinOutcomeFromError(
  error: OpenSocialCommunityError,
): JoinOutcomeCode | null {
  switch (error.code) {
    case "AlreadyMember":
      return "already";
    case "AlreadyPending":
      return "pending";
    default:
      return null;
  }
}

function leaveOutcomeFromError(
  error: OpenSocialCommunityError,
): JoinOutcomeCode | null {
  switch (error.code) {
    case "NotMember":
      return "not-member";
    case "CannotLeaveAsAdmin":
      return "admin-block";
    default:
      return null;
  }
}
