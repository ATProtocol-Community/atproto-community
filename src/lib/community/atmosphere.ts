import { resolveHandleToDid } from "./identity";

export const ATMOSPHERE_COMMUNITY_HANDLE = "atmosphere.community";

export function getAtmosphereCommunityDid(): Promise<string> {
  return resolveHandleToDid(ATMOSPHERE_COMMUNITY_HANDLE);
}
