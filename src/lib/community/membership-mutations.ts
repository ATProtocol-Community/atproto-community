import { type JoinStatusCode } from "./join-status";
import {
  OpenSocialCommunityError,
  ensureUserMembershipRecord,
  getMembership,
  joinCommunity,
  leaveCommunity,
} from "../opensocial/membership";

type LoggedInUser = NonNullable<App.Locals["loggedInUser"]>;

export async function runJoin(
  loggedInUser: LoggedInUser,
  communityDid: string,
): Promise<JoinStatusCode> {
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
    if (err instanceof OpenSocialCommunityError) return joinStatusFromError(err);
    if (isPermissionError(err)) return "permission";
    console.warn("[runJoin] unexpected error", err);
    return "error";
  }
}

export async function runLeave(
  loggedInUser: LoggedInUser,
  communityDid: string,
): Promise<JoinStatusCode> {
  try {
    await leaveCommunity({ communityDid, userDid: loggedInUser.did });
    return "left";
  } catch (err) {
    if (err instanceof OpenSocialCommunityError) return leaveStatusFromError(err);
    if (isPermissionError(err)) return "permission";
    console.warn("[runLeave] unexpected error", err);
    return "error";
  }
}

function joinStatusFromError(err: OpenSocialCommunityError): JoinStatusCode {
  switch (err.code) {
    case "AlreadyMember":
      return "already";
    case "AlreadyPending":
      return "pending";
    case "CommunityNotFound":
      return "missing";
    default:
      return "error";
  }
}

function leaveStatusFromError(err: OpenSocialCommunityError): JoinStatusCode {
  switch (err.code) {
    case "NotMember":
      return "not-member";
    case "CommunityNotFound":
      return "missing";
    case "CannotLeaveAsAdmin":
      return "admin-block";
    default:
      return "error";
  }
}

function isPermissionError(error: unknown): boolean {
  const maybeError = error as {
    status?: number;
    error?: string;
    message?: string;
  };
  const text = `${maybeError.error ?? ""} ${maybeError.message ?? ""}`.toLowerCase();
  return (
    maybeError.status === 401 ||
    maybeError.status === 403 ||
    text.includes("scope")
  );
}
