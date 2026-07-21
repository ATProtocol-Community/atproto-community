import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign as cryptoSign,
  type KeyObject,
} from "node:crypto";

export function parsePrivateKey({
  base64,
  pem,
}: {
  base64?: string;
  pem?: string;
}): KeyObject {
  if (base64 && base64.length > 0) {
    return createPrivateKey(Buffer.from(base64, "base64").toString("utf-8"));
  }
  if (pem && pem.length > 0) {
    return createPrivateKey(
      pem.includes("\\n") ? pem.replaceAll("\\n", "\n") : pem,
    );
  }
  throw new Error(
    "OPENSOCIAL_CIMD_PRIVATE_KEY_BASE64 (or _PEM) not set. " +
      "Generate one with: `node scripts/generate-cimd-key.mjs`",
  );
}

export function createPublicJwk({
  privateKey,
  kid,
}: {
  privateKey: KeyObject;
  kid: string;
}): {
  kty: string;
  crv?: string;
  x?: string;
  kid: string;
  use: "sig";
} {
  const pub = createPublicKey(privateKey);
  const jwk = pub.export({ format: "jwk" }) as {
    kty: string;
    crv?: string;
    x?: string;
  };
  return {
    ...jwk,
    kid,
    use: "sig",
  };
}

export function signRequest(opts: {
  method: string;
  url: string;
  body?: string | null;
  keyId: string;
  privateKey: KeyObject;
  /** Override clock for tests. Seconds since epoch. */
  nowSeconds?: number;
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

  const signatureParams = `(${components.join(" ")});created=${created};keyid="${opts.keyId}"`;
  lines.push(`"@signature-params": ${signatureParams}`);

  const signature = cryptoSign(
    null,
    Buffer.from(lines.join("\n"), "utf-8"),
    opts.privateKey,
  );

  return {
    "Signature-Input": `sig1=${signatureParams}`,
    Signature: `sig1=:${signature.toString("base64")}:`,
    ...(digestValue ? { "Content-Digest": digestValue } : {}),
  };
}
