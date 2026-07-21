import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import test from 'node:test'

import {
  createPublicJwk,
  parsePrivateKey,
  signRequest,
} from './keys.js'

test('signRequest labels the signing identity and covers request bodies', () => {
  const { privateKey } = generateKeyPairSync('ed25519')
  const headers = signRequest({
    method: 'POST',
    url: 'https://api.example/xrpc/community.opensocial.joinCommunity',
    body: '{"community":"did:plc:example"}',
    keyId: 'atmosphere.community',
    nowSeconds: 1_721_600_000,
    privateKey,
  })

  assert.equal(
    headers['Signature-Input'],
    'sig1=("@method" "@target-uri" "content-digest");created=1721600000;keyid="atmosphere.community"',
  )
  assert.match(headers.Signature, /^sig1=:[A-Za-z0-9+/]+=*:$/)
  assert.match(
    headers['Content-Digest'] ?? '',
    /^sha-256=:[A-Za-z0-9+/]+=*:$/,
  )
})

test('signRequest omits the content digest for GET requests', () => {
  const { privateKey } = generateKeyPairSync('ed25519')
  const headers = signRequest({
    method: 'GET',
    url: 'https://api.example/xrpc/community.opensocial.getPermissions',
    keyId: 'atmosphere.community',
    nowSeconds: 1_721_600_000,
    privateKey,
  })

  assert.equal(headers['Content-Digest'], undefined)
  assert.equal(
    headers['Signature-Input'],
    'sig1=("@method" "@target-uri");created=1721600000;keyid="atmosphere.community"',
  )
})

test('parsePrivateKey accepts generated base64 and escaped PEM values', () => {
  const { privateKey } = generateKeyPairSync('ed25519')
  const pem = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString()
  const base64 = Buffer.from(pem, 'utf8').toString('base64')

  assert.equal(
    parsePrivateKey({ base64 })
      .export({ format: 'pem', type: 'pkcs8' })
      .toString(),
    pem,
  )
  assert.equal(
    parsePrivateKey({ pem: pem.replaceAll('\n', '\\n') })
      .export({ format: 'pem', type: 'pkcs8' })
      .toString(),
    pem,
  )
})

test('createPublicJwk keeps the configured JWK kid', () => {
  const { privateKey } = generateKeyPairSync('ed25519')
  const jwk = createPublicJwk({ privateKey, kid: 'opensocial-cimd-test' })

  assert.equal(jwk.kid, 'opensocial-cimd-test')
  assert.equal(jwk.use, 'sig')
  assert.equal(jwk.kty, 'OKP')
  assert.equal(jwk.crv, 'Ed25519')
})
