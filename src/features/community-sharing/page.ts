import { getBlueskyAgent } from "@fujocoded/authproto/helpers";

import { getShareCandidates } from "../../lib/community/share-candidates";

type ShareCandidates = Awaited<ReturnType<typeof getShareCandidates>>;

interface ShareSourceProfile {
  displayName?: string;
  avatar?: string;
}

interface SharePanelState {
  shareRepo: string;
  shareSourceProfile: ShareSourceProfile | null;
  shareCandidates: ShareCandidates | null;
  shareCandidatesError: boolean;
}

export async function getCommunitySharePanelState({
  sourceParam,
  fallbackRepo,
  canShareContent,
}: {
  sourceParam: string | null | undefined;
  fallbackRepo: string | null | undefined;
  canShareContent: boolean;
}): Promise<SharePanelState> {
  const shareRepo = sourceParam?.trim() || fallbackRepo || "";
  if (!shareRepo || !canShareContent) {
    return {
      shareRepo,
      shareSourceProfile: null,
      shareCandidates: null,
      shareCandidatesError: false,
    };
  }

  try {
    const agent = await getBlueskyAgent();
    const [profileResult, candidatesResult] = await Promise.allSettled([
      agent?.app.bsky.actor.getProfile({ actor: shareRepo }),
      getShareCandidates(shareRepo),
    ]);

    return {
      shareRepo,
      shareSourceProfile:
        profileResult.status === "fulfilled"
          ? {
              displayName: profileResult.value?.data.displayName,
              avatar: profileResult.value?.data.avatar,
            }
          : null,
      shareCandidates:
        candidatesResult.status === "fulfilled" ? candidatesResult.value : null,
      shareCandidatesError: candidatesResult.status !== "fulfilled",
    };
  } catch (error) {
    console.warn("[community-content] share candidate lookup failed", error);
    return {
      shareRepo,
      shareSourceProfile: null,
      shareCandidates: null,
      shareCandidatesError: true,
    };
  }
}
