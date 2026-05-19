import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign as cryptoSign,
  type KeyObject,
} from "node:crypto";

const DEFAULT_KID = "opensocial-cimd-1";

/** Truthy when the configured value exists and is non-empty. */
export function hasPrivateKey(): boolean {
  return (
    !!import.meta.env.OPENSOCIAL_CIMD_PRIVATE_KEY_BASE64 ||
    !!import.meta.env.OPENSOCIAL_CIMD_PRIVATE_KEY_PEM
  );
}

function loadPrivatePem(): string {
  const b64 = import.meta.env.OPENSOCIAL_CIMD_PRIVATE_KEY_BASE64;
  if (b64 && b64.length > 0) {
    return Buffer.from(b64, "base64").toString("utf-8");
  }
  const pem = import.meta.env.OPENSOCIAL_CIMD_PRIVATE_KEY_PEM;
  if (pem && pem.length > 0) {
    return pem.includes("\\n") ? pem.replaceAll("\\n", "\n") : pem;
  }
  throw new Error(
    "OPENSOCIAL_CIMD_PRIVATE_KEY_BASE64 (or _PEM) not set. " +
      "Generate one with: `node scripts/generate-cimd-key.mjs`",
  );
}

let cachedPrivate: KeyObject | null = null;
function getPrivateKey(): KeyObject {
  if (!cachedPrivate) cachedPrivate = createPrivateKey(loadPrivatePem());
  return cachedPrivate;
}

let cachedPublicJwk: {
  kty: string;
  crv?: string;
  x?: string;
  kid: string;
  use: "sig";
} | null = null;
export function getPublicJwk() {
  if (cachedPublicJwk) return cachedPublicJwk;
  const pub = createPublicKey(getPrivateKey());
  const jwk = pub.export({ format: "jwk" }) as {
    kty: string;
    crv?: string;
    x?: string;
  };
  cachedPublicJwk = {
    ...jwk,
    kid: import.meta.env.OPENSOCIAL_CIMD_KID || DEFAULT_KID,
    use: "sig",
  };
  return cachedPublicJwk;
}

/**
 * The registered open-social app id, used as the `keyid` parameter in HTTP
 * Message Signatures so the server can resolve our CIMD document. Distinct
 * from `kid`: kid identifies which key inside our JWKS; appId identifies us.
 */
export function getAppId(): string | null {
  const id = import.meta.env.OPENSOCIAL_APP_ID;
  return id && id.length > 0 ? id : null;
}

export function signRequest(opts: {
  method: string;
  url: string;
  body?: string | null;
  appId: string;
  /** Override clock for tests. Seconds since epoch. */
  nowSeconds?: number;
  /** Override the private key for tests. Defaults to getPrivateKey(). */
  privateKey?: KeyObject;
}) {
  const method = opts.method.toUpperCase();
  const created = opts.nowSeconds ?? Math.floor(Date.now() / 1000);
  const hasBody = method !== "GET" && method !== "HEAD";

  const components: string[] = ['"@method"', '"@target-uri"'];
  const lines: string[] = [
    `"@method": ${method}`,
    `"@target-uri": ${opts.url}`,
  ];

  let digestValue: string | undefined = undefined;
  if (hasBody) {
    const body = opts.body ?? "";
    digestValue = `sha-256=:${createHash("sha256")
      .update(body)
      .digest("base64")}:`;
    components.push('"content-digest"');
    lines.push(`"content-digest": ${digestValue}`);
  }

  const signatureParams = `(${components.join(" ")});created=${created};keyid="${opts.appId}"`;
  lines.push(`"@signature-params": ${signatureParams}`);

  const signature = cryptoSign(
    null,
    Buffer.from(lines.join("\n"), "utf-8"),
    opts.privateKey ?? getPrivateKey(),
  );

  return {
    "Signature-Input": `sig1=${signatureParams}`,
    Signature: `sig1=:${signature.toString("base64")}:`,
    "Content-Digest": digestValue,
  };
}
