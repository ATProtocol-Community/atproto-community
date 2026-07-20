import { ActionError, defineAction } from "astro:actions";
import { z } from "astro/zod";

import { getAtmosphereCommunityDid } from "../../lib/community/atmosphere";
import { resolveHandleToDid } from "../../lib/community/repo";
import { OpenSocialCommunityError } from "../../lib/opensocial/client";
import { isPermissionError } from "../../lib/action-result";
import { runJoin, runLeave } from "./mutations";
import { getJoinErrorMessage, type JoinOutcomeCode } from "./notice";

export const membershipActions = {
  joinAtmosphereCommunity: defineAction({
    accept: "form",
    handler: async (_input, ctx): Promise<{ outcome: JoinOutcomeCode }> => {
      const loggedInUser = ctx.locals.loggedInUser;
      if (!loggedInUser) {
        throw new ActionError({
          code: "UNAUTHORIZED",
          message: getJoinErrorMessage("UNAUTHORIZED"),
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

  joinOpenSocialCommunity: defineAction({
    accept: "form",
    input: z.object({ handle: z.string().min(1) }),
    handler: async (
      input,
      ctx,
    ): Promise<{ outcome: JoinOutcomeCode; community: string }> => {
      const loggedInUser = ctx.locals.loggedInUser;
      if (!loggedInUser) {
        throw new ActionError({
          code: "UNAUTHORIZED",
          message: getJoinErrorMessage("UNAUTHORIZED"),
        });
      }

      let communityDid: string;
      try {
        communityDid = await resolveHandleToDid({ handleOrDid: input.handle });
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

  leaveOpenSocialCommunity: defineAction({
    accept: "form",
    input: z.object({ handle: z.string().min(1) }),
    handler: async (
      input,
      ctx,
    ): Promise<{ outcome: JoinOutcomeCode; community: string }> => {
      const loggedInUser = ctx.locals.loggedInUser;
      if (!loggedInUser) {
        throw new ActionError({
          code: "UNAUTHORIZED",
          message: getJoinErrorMessage("UNAUTHORIZED"),
        });
      }

      let communityDid: string;
      try {
        communityDid = await resolveHandleToDid({ handleOrDid: input.handle });
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
    handler: async (_input, ctx): Promise<{ outcome: JoinOutcomeCode }> => {
      const loggedInUser = ctx.locals.loggedInUser;
      if (!loggedInUser) {
        throw new ActionError({
          code: "UNAUTHORIZED",
          message: getJoinErrorMessage("UNAUTHORIZED"),
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
        message: getJoinErrorMessage("NOT_FOUND"),
      });
    }
  }

  if (isPermissionError(error)) {
    return new ActionError({
      code: "FORBIDDEN",
      message: getJoinErrorMessage("FORBIDDEN"),
    });
  }

  console.warn("[membershipActions] unexpected error", error);
  return new ActionError({
    code: "INTERNAL_SERVER_ERROR",
    message: getJoinErrorMessage("INTERNAL_SERVER_ERROR"),
  });
}
