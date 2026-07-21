import type { KeyObject } from "node:crypto";
import { getSecret } from "astro:env/server";

import {
  createPublicJwk,
  parsePrivateKey,
  signRequest as signRequestWithKey,
} from "./keys.js";

const DEFAULT_KID = "opensocial-cimd-1";

let cachedPrivate: KeyObject | null = null;
function getPrivateKey(): KeyObject {
  if (!cachedPrivate) {
    cachedPrivate = parsePrivateKey({
      base64: getSecret("OPENSOCIAL_CIMD_PRIVATE_KEY_BASE64"),
      pem: getSecret("OPENSOCIAL_CIMD_PRIVATE_KEY_PEM"),
    });
  }
  return cachedPrivate;
}

let cachedPublicJwk: ReturnType<typeof createPublicJwk> | null = null;
export function getPublicJwk(): ReturnType<typeof createPublicJwk> {
  if (!cachedPublicJwk) {
    cachedPublicJwk = createPublicJwk({
      privateKey: getPrivateKey(),
      kid: getSecret("OPENSOCIAL_CIMD_KID") || DEFAULT_KID,
    });
  }
  return cachedPublicJwk;
}

export function signRequest(opts: {
  method: string;
  url: string;
  body?: string | null;
  keyId: string;
  /** Override clock for tests. Seconds since epoch. */
  nowSeconds?: number;
  /** Override the private key for tests. Defaults to the configured server key. */
  privateKey?: KeyObject;
}) {
  return signRequestWithKey({
    ...opts,
    privateKey: opts.privateKey ?? getPrivateKey(),
  });
}
