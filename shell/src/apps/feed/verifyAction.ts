// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Client-side signature verification for Cloudillo actions.
 *
 * Every action is a compact JWS (`header.payload.signature`, base64url, no
 * padding) signed with ES384 (ECDSA P-384 + SHA-384). The header carries only
 * `{ "alg": "ES384" }`; the signing key id lives in the payload as `k`. The
 * `jsonwebtoken` crate on the backend emits JWS-standard raw R‖S signatures
 * (96 bytes), which is exactly what WebCrypto's verify expects — so no DER→raw
 * conversion is normally needed (we keep a defensive DER fallback regardless).
 *
 * The action id binds the token: `actionId = "a1~" + base64url(SHA256(token))`,
 * so we can cheaply confirm a token belongs to an action before doing crypto.
 *
 * Framework-free; mirrors the WebCrypto usage in `shell/src/cache/crypto.ts`.
 */

import type { ProfileKeys } from '@cloudillo/core'

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

/** base64url (with or without padding, `-_` alphabet) → bytes. */
function base64urlToBytes(s: string): Uint8Array {
	const clean = s.replace(/\s+/g, '')
	const padded = clean + '='.repeat((4 - (clean.length % 4)) % 4)
	const b64 = padded.replace(/-/g, '+').replace(/_/g, '/')
	const bin = atob(b64)
	const bytes = new Uint8Array(bin.length)
	for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
	return bytes
}

/**
 * Standard base64 (PEM body) → bytes. Also tolerates url-safe input by
 * normalizing the alphabet, so a single helper covers both key and signature
 * encodings.
 */
function base64ToBytes(s: string): Uint8Array {
	return base64urlToBytes(s)
}

/** bytes → base64url, no padding (matches the backend hasher output). */
function bytesToBase64Url(bytes: Uint8Array): string {
	let bin = ''
	for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
	return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export interface JwsHeader {
	alg?: string
	[k: string]: unknown
}

export interface JwsPayload {
	iss?: string // issuer idTag
	k?: string // keyId
	t?: string // type, e.g. "REACT:LIKE"
	iat?: number
	sub?: string // subject action id
	aud?: string
	exp?: number
	[k: string]: unknown
}

export interface DecodedJws {
	headerB64: string
	payloadB64: string
	sigB64: string
	header: JwsHeader
	payload: JwsPayload
	/** UTF-8 bytes of `headerB64 + '.' + payloadB64` — the JWS signing input. */
	signingInput: Uint8Array
}

/** Split & base64url-decode a compact JWS. Returns null on malformed input. */
export function decodeJws(token: string): DecodedJws | null {
	const parts = token.split('.')
	if (parts.length !== 3) return null
	const [headerB64, payloadB64, sigB64] = parts
	try {
		const header = JSON.parse(textDecoder.decode(base64urlToBytes(headerB64))) as JwsHeader
		const payload = JSON.parse(textDecoder.decode(base64urlToBytes(payloadB64))) as JwsPayload
		const signingInput = textEncoder.encode(`${headerB64}.${payloadB64}`)
		return { headerB64, payloadB64, sigB64, header, payload, signingInput }
	} catch {
		return null
	}
}

/**
 * Recompute the content-addressed action id from the raw token and compare to
 * the claimed one. Cheap integrity bind — reject mismatches before crypto.
 */
export async function tokenMatchesAction(token: string, actionId: string): Promise<boolean> {
	const digest = await crypto.subtle.digest('SHA-256', textEncoder.encode(token))
	return `a1~${bytesToBase64Url(new Uint8Array(digest))}` === actionId
}

/** Import an SPKI/DER public key (base64) for ECDSA P-384 verification. */
export function importVerifyKey(publicKeyB64: string): Promise<CryptoKey> {
	return crypto.subtle.importKey(
		'spki',
		base64ToBytes(publicKeyB64) as unknown as ArrayBuffer,
		{ name: 'ECDSA', namedCurve: 'P-384' },
		false,
		['verify']
	)
}

/**
 * Convert a DER-encoded ECDSA signature (SEQUENCE { INTEGER r, INTEGER s }) to
 * the JOSE raw R‖S form WebCrypto expects. `size` is the per-component byte
 * length (48 for P-384). Returns null if the input is not parseable DER.
 *
 * Defensive only: JWS tokens already carry raw R‖S, but a non-standard signer
 * could emit DER, so we retry once with this conversion before giving up.
 */
function derToRaw(der: Uint8Array, size: number): Uint8Array | null {
	let offset = 0
	if (der[offset++] !== 0x30) return null
	// Skip (possibly long-form) sequence length.
	if (der[offset] & 0x80) {
		const n = der[offset++] & 0x7f
		offset += n
	} else {
		offset++
	}
	const readInt = (): Uint8Array | null => {
		if (der[offset++] !== 0x02) return null
		const len = der[offset++]
		let val = der.slice(offset, offset + len)
		offset += len
		// Strip leading zero padding.
		while (val.length > 0 && val[0] === 0x00) val = val.slice(1)
		if (val.length > size) return null
		const out = new Uint8Array(size)
		out.set(val, size - val.length)
		return out
	}
	const r = readInt()
	const s = readInt()
	if (!r || !s) return null
	const raw = new Uint8Array(size * 2)
	raw.set(r, 0)
	raw.set(s, size)
	return raw
}

export type VerifyStatus = 'verified' | 'invalid' | 'no-key' | 'error'

export interface VerifyResult {
	status: VerifyStatus
	issuer?: string
	keyId?: string
}

export interface VerifyExpect {
	issuerIdTag?: string
	subjectActionId?: string
	audienceTag?: string
}

/**
 * Verify an action's JWS against a profile's published keys.
 *
 *  - `verified` — signature checks out and any provided claim expectations match
 *  - `invalid`  — signature failed, or `iss`/`sub` claims contradict expectations
 *  - `no-key`   — the profile published no key matching the token's `k`
 *  - `error`    — malformed token / unsupported alg / crypto error
 */
export async function verifyActionToken(
	token: string,
	profileKeys: ProfileKeys,
	expect?: VerifyExpect
): Promise<VerifyResult> {
	const decoded = decodeJws(token)
	if (!decoded) return { status: 'error' }
	const { header, payload, sigB64, signingInput } = decoded
	const issuer = payload.iss
	const keyId = payload.k
	if (header.alg !== 'ES384') return { status: 'error', issuer, keyId }

	const keyEntry = profileKeys.keys.find((k) => k.keyId === keyId)
	if (!keyEntry) return { status: 'no-key', issuer, keyId }

	try {
		const key = await importVerifyKey(keyEntry.publicKey)
		const algo = { name: 'ECDSA', hash: 'SHA-384' } as const
		const input = signingInput as unknown as ArrayBuffer
		const rawSig = base64urlToBytes(sigB64)
		let ok = await crypto.subtle.verify(algo, key, rawSig as unknown as ArrayBuffer, input)
		// Defensive: a non-standard signer may have emitted DER. Retry once.
		if (!ok && rawSig[0] === 0x30) {
			const raw = derToRaw(rawSig, 48)
			if (raw) {
				ok = await crypto.subtle.verify(algo, key, raw as unknown as ArrayBuffer, input)
			}
		}
		if (!ok) return { status: 'invalid', issuer, keyId }

		// Cross-check claims against what the caller expected this token to assert.
		if (expect?.issuerIdTag && issuer !== expect.issuerIdTag) {
			return { status: 'invalid', issuer, keyId }
		}
		if (expect?.subjectActionId && payload.sub !== expect.subjectActionId) {
			return { status: 'invalid', issuer, keyId }
		}
		// Symmetric with the issuer/subject checks above: when an audience is
		// expected, require the claim to be present AND to match (a missing `aud`
		// is not a free pass). Signed REACT/REPOST tokens always carry `aud`.
		if (expect?.audienceTag && payload.aud !== expect.audienceTag) {
			return { status: 'invalid', issuer, keyId }
		}
		return { status: 'verified', issuer, keyId }
	} catch {
		return { status: 'error', issuer, keyId }
	}
}

// Module-level, session-lifetime cache of fetched public keys, keyed by idTag.
// A persistent IndexedDB-backed cache is a possible later upgrade but is out of
// scope now (no second consumer yet).
const keyCache = new Map<string, ProfileKeys>()

export function getCachedProfileKeys(idTag: string): ProfileKeys | undefined {
	return keyCache.get(idTag)
}

export function cacheProfileKeys(idTag: string, keys: ProfileKeys): void {
	keyCache.set(idTag, keys)
}

// vim: ts=4
