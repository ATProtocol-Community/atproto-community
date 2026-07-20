import assert from 'node:assert/strict'
import test from 'node:test'

import {
  resolveStandardDocumentUrl,
  toSafeExternalHref,
} from './community/shared-content.js'

const FALLBACK = 'https://fallback.example/'

test('toSafeExternalHref accepts http and https URLs', () => {
  assert.equal(
    toSafeExternalHref('https://example.com/path', { fallback: FALLBACK }),
    'https://example.com/path',
  )
  assert.equal(
    toSafeExternalHref('http://example.com/path', { fallback: FALLBACK }),
    'http://example.com/path',
  )
})

test('toSafeExternalHref rejects javascript, data, vbscript, and file schemes', () => {
  assert.equal(
    toSafeExternalHref('javascript:alert(1)', { fallback: FALLBACK }),
    FALLBACK,
  )
  assert.equal(
    toSafeExternalHref('data:text/html,<h1>bad</h1>', { fallback: FALLBACK }),
    FALLBACK,
  )
  assert.equal(
    toSafeExternalHref('vbscript:MsgBox("bad")', { fallback: FALLBACK }),
    FALLBACK,
  )
  assert.equal(
    toSafeExternalHref('file:///etc/passwd', { fallback: FALLBACK }),
    FALLBACK,
  )
})

test('toSafeExternalHref rejects scheme-relative and obfuscated links', () => {
  assert.equal(
    toSafeExternalHref('//example.com/path', { fallback: FALLBACK }),
    FALLBACK,
  )
  assert.equal(
    toSafeExternalHref(' javascript:alert(1)', { fallback: FALLBACK }),
    FALLBACK,
  )
  assert.equal(
    toSafeExternalHref('\tjavascript:alert(1)', { fallback: FALLBACK }),
    FALLBACK,
  )
})

test('toSafeExternalHref appends a relative path to a safe base', () => {
  assert.equal(
    toSafeExternalHref('https://example.com/blog', { path: 'post/1' }),
    'https://example.com/blog/post/1',
  )
  assert.equal(
    toSafeExternalHref('https://example.com/blog', { path: '/post/1' }),
    'https://example.com/blog/post/1',
  )
})

test('toSafeExternalHref rejects paths that carry their own authority or scheme', () => {
  assert.equal(
    toSafeExternalHref('https://example.com', {
      path: '//evil.example/path',
      fallback: FALLBACK,
    }),
    FALLBACK,
  )
  assert.equal(
    toSafeExternalHref('https://example.com', {
      path: 'https://evil.example/path',
      fallback: FALLBACK,
    }),
    FALLBACK,
  )
  assert.equal(
    toSafeExternalHref('https://example.com', {
      path: ' javascript:alert(1)',
      fallback: FALLBACK,
    }),
    FALLBACK,
  )
})

test('resolveStandardDocumentUrl protects against absolute path override attempts', async () => {
  const document = {
    site: 'https://publisher.example',
    path: '//evil.example/path',
  } as Record<string, unknown>
  const value = await resolveStandardDocumentUrl(
    document,
    'did:example:alice',
    'rkey',
    async () => null,
    FALLBACK,
  )
  assert.equal(value, 'https://leaflet.pub/profile/did:example:alice/rkey')
})

test('resolveStandardDocumentUrl rejects javascript path values', async () => {
  const document = {
    site: 'https://publisher.example',
    path: ' javascript:alert(1)',
  } as Record<string, unknown>
  const value = await resolveStandardDocumentUrl(
    document,
    'did:example:alice',
    'rkey',
    async () => null,
    FALLBACK,
  )
  assert.equal(value, 'https://leaflet.pub/profile/did:example:alice/rkey')
})
