// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The page <-> ServiceWorker message protocol: envelope, per-message schemas
 * and the two decoders.
 *
 * Both sides encode and decode this wire format, so it lives here rather than in
 * either context: a divergence between two definitions would be a runtime break.
 * Unrelated to `PROTOCOL_VERSION` in `@cloudillo/core`, which versions the
 * separate app <-> shell bus — and deliberately not defined there, because the
 * worker must not import the `@cloudillo/core` barrel (API client, app bus, DOM).
 * Its dependency-free leaf subpaths (`/jwt`, `/base64`) are fine, and are why
 * there is no second copy of that code here.
 *
 * The worker handles credentials (session token, API key, encryption key), so
 * every field it reads is validated rather than cast: a malformed message must be
 * rejected, not throw inside an async message handler.
 *
 * DOM-free: bundled into both the page and the ServiceWorker.
 */

import * as T from '@symbion/runtype'

export const PROTOCOL_VERSION = 1

// The senders (`swNotify`/`swRequest`) always spell out `payload`, and requests
// add `id`, so extra keys are the norm on this wire — drop them rather than
// treating them as errors.
const DECODE_OPTS = { unknownFields: 'drop' } as const

const envelope = {
	cloudillo: T.trueValue,
	v: T.literal(PROTOCOL_VERSION)
}

// --- PAGE -> WORKER ---

/** Hand the session (or scoped) token to the worker. */
export const tSwTokenSet = T.struct({
	...envelope,
	type: T.literal('sw:token.set'),
	payload: T.struct({ token: T.string })
})

/** Logout: drop the token and everything minted from it. */
export const tSwTokenClear = T.struct({
	...envelope,
	type: T.literal('sw:token.clear')
})

/** The page has no token to give — answers `sw:token.request`. */
export const tSwTokenNone = T.struct({
	...envelope,
	type: T.literal('sw:token.none')
})

/**
 * Store the API key in the worker's encrypted store. Answered with
 * `sw:apikey.set.ack` — the write is skipped when the worker holds no encryption
 * key, and that must not read as a stored key. `id` is optional so a page that
 * only notifies still decodes.
 */
export const tSwApiKeySet = T.struct({
	...envelope,
	type: T.literal('sw:apikey.set'),
	payload: T.struct({ apiKey: T.string }),
	id: T.optional(T.number)
})

/** Read the stored API key back. Answered with `sw:apikey.get.res`. */
export const tSwApiKeyGetReq = T.struct({
	...envelope,
	type: T.literal('sw:apikey.get.req'),
	id: T.number
})

/** Forget the stored API key. */
export const tSwApiKeyDel = T.struct({
	...envelope,
	type: T.literal('sw:apikey.del')
})

/** Firefox/Safari: relay the encryption key the page read from the cookie. */
export const tSwKeySet = T.struct({
	...envelope,
	type: T.literal('sw:key.set'),
	payload: T.struct({ key: T.string })
})

/** Key loss: wipe everything encrypted under the old key. */
export const tSwKeyReset = T.struct({
	...envelope,
	type: T.literal('sw:key.reset'),
	id: T.optional(T.number)
})

/** Take control of the page (used after a hard reload). */
export const tSwClaim = T.struct({
	...envelope,
	type: T.literal('sw:claim')
})

export const tSwMessage = T.taggedUnion('type')({
	'sw:token.set': tSwTokenSet,
	'sw:token.clear': tSwTokenClear,
	'sw:token.none': tSwTokenNone,
	'sw:apikey.set': tSwApiKeySet,
	'sw:apikey.get.req': tSwApiKeyGetReq,
	'sw:apikey.del': tSwApiKeyDel,
	'sw:key.set': tSwKeySet,
	'sw:key.reset': tSwKeyReset,
	'sw:claim': tSwClaim
})
export type SwMessage = T.TypeOf<typeof tSwMessage>

// --- WORKER -> PAGE ---

/** The stored API key, in reply to `sw:apikey.get.req`. */
export const tSwApiKeyGetRes = T.struct({
	...envelope,
	type: T.literal('sw:apikey.get.res'),
	replyTo: T.number,
	ok: T.optional(T.boolean),
	data: T.optional(T.struct({ apiKey: T.optional(T.string) })),
	error: T.optional(T.string)
})

/**
 * `sw:key.reset` is done. `ok: false` means the worker threw partway through —
 * optional, so an ack from a worker predating the field still decodes (and is
 * read as success, which is what it meant).
 */
export const tSwKeyResetAck = T.struct({
	...envelope,
	type: T.literal('sw:key.reset.ack'),
	replyTo: T.optional(T.number),
	ok: T.optional(T.boolean),
	data: T.optional(T.struct({})),
	error: T.optional(T.string)
})

/**
 * `sw:apikey.set` is done. `ok: false` means the worker could not encrypt and
 * therefore stored nothing. Optional fields throughout, so an ack from a worker
 * predating them still decodes; a worker predating the ack itself stays silent
 * and the page falls back on the request timeout.
 */
export const tSwApiKeySetAck = T.struct({
	...envelope,
	type: T.literal('sw:apikey.set.ack'),
	replyTo: T.optional(T.number),
	ok: T.optional(T.boolean),
	data: T.optional(T.struct({})),
	error: T.optional(T.string)
})

/** The worker restarted and lost its token — asks a window client for one. */
export const tSwTokenRequest = T.struct({
	...envelope,
	type: T.literal('sw:token.request')
})

export const tSwInbound = T.taggedUnion('type')({
	'sw:apikey.get.res': tSwApiKeyGetRes,
	'sw:apikey.set.ack': tSwApiKeySetAck,
	'sw:key.reset.ack': tSwKeyResetAck,
	'sw:token.request': tSwTokenRequest
})
export type SwInbound = T.TypeOf<typeof tSwInbound>

// --- DECODERS ---

/** A page -> worker message, or null when it is not one we accept. */
export function decodeSwMessage(data: unknown): SwMessage | null {
	const result = T.decode(tSwMessage, data, DECODE_OPTS)
	return T.isOk(result) ? result.ok : null
}

/** A worker -> page message, or null when it is not one we accept. */
export function decodeSwInbound(data: unknown): SwInbound | null {
	const result = T.decode(tSwInbound, data, DECODE_OPTS)
	return T.isOk(result) ? result.ok : null
}

// vim: ts=4
