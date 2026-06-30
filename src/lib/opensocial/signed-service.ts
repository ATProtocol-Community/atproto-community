// Vendored from @fujocoded/atproto-lex-client/signed-service so this repo
// does not depend on a sibling checkout for opensocial request signing.

import type { Agent } from "@atproto/lex";

export interface SignedServiceRequest {
  readonly method: string;
  readonly url: string;
  readonly body?: string;
  readonly headers: Headers;
}

export type SignedServiceRequestSigner = (
  request: SignedServiceRequest,
) => HeadersInit | Promise<HeadersInit>;

export interface SignedServiceAgentOptions {
  serviceUrl: string | URL;
  did?: Agent["did"];
  headers?: HeadersInit;
  fetch?: typeof globalThis.fetch;
  signRequest: SignedServiceRequestSigner;
}

export function createSignedServiceAgent(
  options: SignedServiceAgentOptions,
): Agent {
  const fetchImpl = getFetch(options.fetch);

  return {
    did: options.did,
    async fetchHandler(path, init) {
      const method = (init.method ?? "GET").toUpperCase();
      const url = new URL(path, options.serviceUrl);
      const headers = mergeHeaders(options.headers, init.headers);
      const body = readSignableBody(init.body);
      const signedHeaders = await options.signRequest({
        method,
        url: url.href,
        body,
        headers: new Headers(headers),
      });

      return fetchImpl(url, {
        ...init,
        method,
        headers: mergeHeaders(headers, signedHeaders),
      });
    },
  };
}

function mergeHeaders(...headersInit: (HeadersInit | undefined)[]): Headers {
  const headers = new Headers();

  for (const init of headersInit) {
    if (init === undefined) {
      continue;
    }

    new Headers(init).forEach((value, key) => {
      headers.set(key, value);
    });
  }

  return headers;
}

function getFetch(
  fetchImpl: typeof globalThis.fetch | undefined,
): typeof globalThis.fetch {
  const resolvedFetch = fetchImpl ?? globalThis.fetch;

  if (typeof resolvedFetch !== "function") {
    throw new TypeError("fetch() is not available in this environment");
  }

  return resolvedFetch;
}

function readSignableBody(body: RequestInit["body"]): string | undefined {
  if (body === undefined || body === null) {
    return undefined;
  }

  if (typeof body === "string") {
    return body;
  }

  throw new TypeError(
    "Signed service requests only support string bodies. Serialize the body before signing or use an unsigned/binary-specific agent.",
  );
}
