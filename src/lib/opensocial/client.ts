import { XrpcError, isDidString } from "@atproto/lex";
import { getSecret } from "astro:env/server";

import { createSignedLexClient } from "./xrpc.js";

const DEFAULT_SERVICE = "https://api.opensocial.community";

export class OpenSocialCommunityError extends Error {
  constructor(
    public readonly status: number,
    /** XRPC error name (e.g. "AlreadyMember") when the response carried one. */
    public readonly code: string | null,
    message: string,
  ) {
    super(message);
    this.name = "OpenSocialCommunityError";
  }
}

export function createOpenSocialClient() {
  const keyId =
    getSecret("OPENSOCIAL_SIGNATURE_KEY_ID") ||
    getSecret("OPENSOCIAL_APP_ID");
  if (!keyId) {
    throw new Error(
      "OPENSOCIAL_SIGNATURE_KEY_ID is not set; cannot sign OpenSocial requests",
    );
  }

  return createSignedLexClient({
    service: getSecret("OPENSOCIAL_SERVICE") || DEFAULT_SERVICE,
    keyId,
  });
}

export function did(value: string, label: string) {
  if (isDidString(value)) return value;
  throw new Error(`${label} must be a valid DID`);
}

export async function xrpc<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (err) {
    throw toOpenSocialCommunityError(err);
  }
}

function toOpenSocialCommunityError(err: unknown): OpenSocialCommunityError {
  if (err instanceof OpenSocialCommunityError) return err;
  if (err instanceof XrpcError) {
    const downstream = err.toDownstreamError();
    return new OpenSocialCommunityError(
      downstream.status,
      downstream.body.error,
      downstream.body.message || downstream.body.error,
    );
  }
  throw err;
}
