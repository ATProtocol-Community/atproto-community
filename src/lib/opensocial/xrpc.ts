// Minimum signed Lexicon client. Server-only: this configures the generic
// signed-service transport with this app's CIMD HTTP Message Signature signer.

import { Client } from "@atproto/lex";
import { createSignedServiceAgent } from "./signed-service.js";

import { signRequest } from "../cmid-signing/index.js";

export function createSignedLexClient(opts: {
  /** Service origin for XRPC calls, for example `https://api.example.com`. */
  service: string | URL;
  /** Registered app id, used as the `keyid` in HTTP signatures. */
  appId: string;
  /** Override for tests. Defaults to global `fetch`. */
  fetchImpl?: typeof fetch;
  /** Defaults to false so callers can start without generated schemas. */
  validateResponse?: boolean;
}): Client {
  return new Client(
    createSignedServiceAgent({
      serviceUrl: opts.service,
      fetch: opts.fetchImpl,
      signRequest(request) {
        return signRequest({
          method: request.method,
          url: request.url,
          body: request.body,
          appId: opts.appId,
        });
      },
    }),
    {
      validateResponse: opts.validateResponse ?? false,
    },
  );
}
