#!/usr/bin/env node
// Generate an Ed25519 key pair for OpenSocial CIMD (HTTP Signatures).
// The private key is what you store in env (never commit). The public JWK
// is what the running server publishes at /.well-known/client-metadata.json.
//
// Usage:
//   node scripts/generate-cimd-key.mjs
//
// Copy the OPENSOCIAL_CIMD_PRIVATE_KEY_BASE64 line into your deploy env.

import { generateKeyPairSync } from "node:crypto";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");

const privatePem = privateKey.export({ format: "pem", type: "pkcs8" });
const publicJwk = publicKey.export({ format: "jwk" });
const privateB64 = Buffer.from(privatePem, "utf8").toString("base64");

const envLines = [
  "# --- OpenSocial CIMD ---",
  "# Private key used to sign requests to api.opensocial.community.",
  `OPENSOCIAL_CIMD_PRIVATE_KEY_BASE64=${privateB64}`,
  "# Optional. Defaults to opensocial-cimd-1. Bump when rotating.",
  `OPENSOCIAL_CIMD_KID=opensocial-cimd-${new Date()
    .toISOString()
    .slice(0, 10)}`,
  "",
  "# Public JWK that will be served at /.well-known/client-metadata.json:",
  `# ${JSON.stringify(publicJwk)}`,
];

console.log(envLines.join("\n"));
