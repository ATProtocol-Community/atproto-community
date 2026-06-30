import { ActionError, defineAction } from "astro:actions";
import { z } from "astro/zod";

import { getAtmosphereCommunityDid } from "../lib/community/atmosphere";
import { resolveHandleToDid } from "../lib/community/identity";
import { type JoinOutcomeCode } from "../lib/community/join-status";
import { runJoin, runLeave } from "../lib/community/membership-mutations";
import { OpenSocialCommunityError } from "../lib/opensocial/client";

interface AtmosphereJoinResult {
  outcome: JoinOutcomeCode;
}

interface ListingJoinResult {
  outcome: JoinOutcomeCode;
  community: string;
}

export const membershipActions = {
  joinAtmosphereCommunity: defineAction({
    accept: "form",
    handler: async (_input, ctx): Promise<AtmosphereJoinResult> => {
      const loggedInUser = ctx.locals.loggedInUser;
      if (!loggedInUser) {
        throw new ActionError({
          code: "UNAUTHORIZED",
          message: "Sign in first, then try again.",
        });
      }

      try {
        const outcome = await runJoin(
          loggedInUser,
          await getAtmosphereCommunityDid(),
        );
        return { outcome };
      } catch (error) {
        throw toMembershipActionError(error);
      }
    },
  }),

  // Listing-page join for any opensocial community, addressed by handle.
  joinOpenSocialCommunity: defineAction({
    accept: "form",
    input: z.object({ handle: z.string().min(1) }),
    handler: async (input, ctx): Promise<ListingJoinResult> => {
      const loggedInUser = ctx.locals.loggedInUser;
      if (!loggedInUser) {
        throw new ActionError({
          code: "UNAUTHORIZED",
          message: "Sign in first, then try again.",
        });
      }
      let communityDid: string;
      try {
        communityDid = await resolveHandleToDid(input.handle);
      } catch {
        throw new ActionError({
          code: "INTERNAL_SERVER_ERROR",
          message: "We couldn't verify that community right now. Try again later.",
        });
      }
      try {
        const outcome = await runJoin(loggedInUser, communityDid);
        return { outcome, community: input.handle };
      } catch (error) {
        throw toMembershipActionError(error);
      }
    },
  }),

  // Listing-page leave for any opensocial community, addressed by handle.
  leaveOpenSocialCommunity: defineAction({
    accept: "form",
    input: z.object({ handle: z.string().min(1) }),
    handler: async (input, ctx): Promise<ListingJoinResult> => {
      const loggedInUser = ctx.locals.loggedInUser;
      if (!loggedInUser) {
        throw new ActionError({
          code: "UNAUTHORIZED",
          message: "Sign in first, then try again.",
        });
      }
      let communityDid: string;
      try {
        communityDid = await resolveHandleToDid(input.handle);
      } catch {
        throw new ActionError({
          code: "INTERNAL_SERVER_ERROR",
          message: "We couldn't verify that community right now. Try again later.",
        });
      }
      try {
        const outcome = await runLeave(loggedInUser, communityDid);
        return { outcome, community: input.handle };
      } catch (error) {
        throw toMembershipActionError(error);
      }
    },
  }),

  leaveAtmosphereCommunity: defineAction({
    accept: "form",
    handler: async (_input, ctx): Promise<AtmosphereJoinResult> => {
      const loggedInUser = ctx.locals.loggedInUser;
      if (!loggedInUser) {
        throw new ActionError({
          code: "UNAUTHORIZED",
          message: "Sign in first, then try again.",
        });
      }

      try {
        const outcome = await runLeave(
          loggedInUser,
          await getAtmosphereCommunityDid(),
        );
        return { outcome };
      } catch (error) {
        throw toMembershipActionError(error);
      }
    },
  }),
};

function toMembershipActionError(error: unknown): ActionError {
  if (error instanceof ActionError) {
    return error;
  }

  if (error instanceof OpenSocialCommunityError) {
    if (error.code === "CommunityNotFound") {
      return new ActionError({
        code: "NOT_FOUND",
        message: "Couldn't find that community right now. Try again later.",
      });
    }
  }

  if (isPermissionError(error)) {
    return new ActionError({
      code: "FORBIDDEN",
      message:
        "Your login needs community membership permission. Log out and back in, then try again.",
    });
  }

  console.warn("[membershipActions] unexpected error", error);
  return new ActionError({
    code: "INTERNAL_SERVER_ERROR",
    message: "Something went wrong. Try again later.",
  });
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
