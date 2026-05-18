import { createPrivateKey, createPublicKey, type KeyObject } from "node:crypto";

const DEFAULT_KID = "opensocial-cimd-1";

function loadPrivatePem(): string {
  const b64 = process.env.OPENSOCIAL_CIMD_PRIVATE_KEY_BASE64;
  if (b64 && b64.length > 0) {
    return Buffer.from(b64, "base64").toString("utf-8");
  }
  const pem = process.env.OPENSOCIAL_CIMD_PRIVATE_KEY_PEM;
  if (pem && pem.length > 0) {
    return pem.includes("\\n") ? pem.replaceAll("\\n", "\n") : pem;
  }
  throw new Error(
    "OPENSOCIAL_CIMD_PRIVATE_KEY_BASE64 (or _PEM) not set. " +
      "Generate one with: `node scripts/generate-cimd-key.mjs`",
  );
}

let cachedPrivate: KeyObject | null = null;
export function getPrivateKey(): KeyObject {
  if (!cachedPrivate) cachedPrivate = createPrivateKey(loadPrivatePem());
  return cachedPrivate;
}

let cachedPublicJwk: PublicJwk | null = null;
export function getPublicJwk(): PublicJwk {
  if (cachedPublicJwk) return cachedPublicJwk;
  const pub = createPublicKey(getPrivateKey());
  const jwk = pub.export({ format: "jwk" }) as {
    kty: string;
    crv?: string;
    x?: string;
  };
  cachedPublicJwk = {
    ...jwk,
    kid: getKid(),
    use: "sig",
  } as PublicJwk;
  return cachedPublicJwk;
}

export function getKid(): string {
  const kid = process.env.OPENSOCIAL_CIMD_KID;
  return kid && kid.length > 0 ? kid : DEFAULT_KID;
}

export interface PublicJwk {
  kty: string;
  crv?: string;
  x?: string;
  kid: string;
  use: "sig";
}
