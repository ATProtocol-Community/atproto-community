// Minimum signed Lexicon client. Server-only: this wraps @atproto/lex's Client
// with the CIMD HTTP Message Signature fetch hook.

import { Client } from "@atproto/lex";

import { signRequest } from "./keys.js";

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
    {
      service: opts.service,
      fetch: createSignedFetch(opts.appId, opts.fetchImpl ?? fetch),
    },
    { validateResponse: opts.validateResponse ?? false },
  );
}

function createSignedFetch(appId: string, fetchImpl: typeof fetch): typeof fetch {
  return async (input, init) => {
    const url = input instanceof Request ? input.url : input.toString();
    const method = (
      init?.method ??
      (input instanceof Request ? input.method : "GET")
    ).toUpperCase();
    const body = bodyToString(init?.body);
    const headers = new Headers(init?.headers);
    const signed = signRequest({ method, url, body, appId });

    for (const [key, value] of Object.entries(signed)) {
      if (value) headers.set(key, value);
    }

    return fetchImpl(input, { ...init, headers });
  };
}

function bodyToString(body: BodyInit | null | undefined): string | null {
  if (body === undefined || body === null) return null;
  if (typeof body === "string") return body;
  throw new TypeError(
    "Signed Lexicon requests require string bodies before signing",
  );
}
