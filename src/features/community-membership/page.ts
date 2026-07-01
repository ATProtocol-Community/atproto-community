import { getAtmosphereCommunityDid } from "../../lib/community/atmosphere";
import { getMembership } from "../../lib/opensocial/membership";
import { pickFirstActionResult } from "../../lib/action-result";
import { getJoinNotice, type JoinNotice, type JoinOutcomeCode } from "./notice";

type JoinResultLike = {
  data?: {
    outcome?: JoinOutcomeCode | null;
    community?: string | null;
  } | null;
  error?: {
    code?: string;
    message?: string;
  } | null;
} | null | undefined;

interface CommunitySummary {
  handle: string;
  name: string;
}

interface CommunityListingJoinState {
  notice: JoinNotice | null;
  communityName?: string;
}

interface CommunityViewerMembershipState {
  isMember: boolean;
  isAdmin: boolean;
}

export function getCommunityListingJoinState(
  {
    communities,
    joinResult,
    leaveResult,
  }: {
    communities: CommunitySummary[];
    joinResult: JoinResultLike;
    leaveResult: JoinResultLike;
  },
): CommunityListingJoinState {
  const result = pickFirstActionResult({
    items: [joinResult, leaveResult],
    hasMeaningfulData: (data) => Boolean(data?.outcome),
  });
  const statusHandle = result?.data?.community?.trim();
  const statusCommunity = statusHandle
    ? communities.find((community) => community.handle === statusHandle)
    : undefined;

  return {
    notice: getJoinNotice(result),
    communityName: statusCommunity?.name,
  };
}

export function getJoinActionNotice(
  joinResult: JoinResultLike,
  leaveResult: JoinResultLike,
): JoinNotice | null {
  return getJoinNotice(
    pickFirstActionResult({
      items: [joinResult, leaveResult],
      hasMeaningfulData: (data) => Boolean(data?.outcome),
    }),
  );
}

export async function getAtmosphereViewerMembershipState(
  loggedInUser: App.Locals["loggedInUser"],
): Promise<CommunityViewerMembershipState> {
  if (!loggedInUser) {
    return {
      isMember: false,
      isAdmin: false,
    };
  }

  try {
    const communityDid = await getAtmosphereCommunityDid();
    const membership = await getMembership({
      communityDid,
      userDid: loggedInUser.did,
    });
    return {
      isMember: membership.isMember,
      isAdmin: membership.isAdmin,
    };
  } catch (error) {
    console.warn("[community-content] membership lookup failed", error);
    return {
      isMember: false,
      isAdmin: false,
    };
  }
}
