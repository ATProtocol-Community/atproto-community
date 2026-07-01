import { getAtmosphereCommunityDid } from "../../lib/community/atmosphere";
import { resolveHandleToDid } from "../../lib/community/identity";
import { getMembership } from "../../lib/opensocial/membership";
import { pickFirstActionResult } from "../../lib/action-result";
import { getJoinNotice, type JoinNotice, type JoinOutcomeCode } from "./notice";
import { type ActionResultLike } from "../../lib/action-result";

type JoinResultLike = ActionResultLike<{
  outcome?: JoinOutcomeCode | null;
  community?: string | null;
}>;

interface CommunitySummary {
  handle: string;
  name: string;
}

interface OpenSocialCommunitySummary {
  handle: string;
  isOpenSocialCommunity?: boolean;
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
) {
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
) {
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

export async function getCommunityListingMembershipState(
  loggedInUser: App.Locals["loggedInUser"],
  communities: OpenSocialCommunitySummary[],
) {
  const memberHandles = new Set<string>();
  const adminHandles = new Set<string>();

  if (!loggedInUser) {
    return { memberHandles, adminHandles };
  }

  const results = await Promise.allSettled(
    communities
      .filter((community) => community.isOpenSocialCommunity)
      .map(async (community) => {
        const communityDid = await resolveHandleToDid(community.handle);
        const membership = await getMembership({
          communityDid,
          userDid: loggedInUser.did,
        });
        return {
          handle: community.handle,
          isMember: membership.isMember,
          isAdmin: membership.isAdmin,
        };
      }),
  );

  for (const result of results) {
    if (result.status !== "fulfilled") {
      continue;
    }
    if (result.value.isMember) {
      memberHandles.add(result.value.handle);
    }
    if (result.value.isAdmin) {
      adminHandles.add(result.value.handle);
    }
  }

  return { memberHandles, adminHandles };
}
