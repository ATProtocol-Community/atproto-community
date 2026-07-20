import { resolveHandleToDid } from "./repo";

export const ATMOSPHERE_COMMUNITY_HANDLE = "atmosphere.community";

export function getAtmosphereCommunityDid(): Promise<string> {
  return resolveHandleToDid({ handleOrDid: ATMOSPHERE_COMMUNITY_HANDLE });
}
