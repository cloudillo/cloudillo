// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { colord, extend } from 'colord'
import lchPlugin from 'colord/plugins/lch'

import { bytesToBase64Url } from './base64.js'

extend([lchPlugin])

export async function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

// Color

/**
 * Stable hue in [0, 360) derived from any string.
 *
 * This is the single hue rule for the whole platform: presence avatars, cursor
 * carets, ghost strokes and identity chips all derive from it, so the same user
 * is the same colour in every app. Synchronous by design — it runs at render
 * time, where `crypto.subtle` (async) cannot be used.
 */
export function idHue(seed: string): number {
	// FNV-1a, 32 bit
	let h = 0x811c9dc5
	for (let i = 0; i < seed.length; i++) {
		h ^= seed.charCodeAt(i)
		h = Math.imul(h, 0x01000193)
	}
	return (h >>> 0) % 360
}

/**
 * The accent colour for a seed: {@link idHue}'s hue at full chroma.
 *
 * Prefer the CSS route — set `--id-hue` and let the `.c-id-color` rules in
 * `@cloudillo/react`'s `components.css` pick the colours — so a theme switch
 * recolours with no re-render. This is for where CSS cannot reach: canvas 2D
 * contexts, SVG attribute values, third-party widgets that want a literal colour.
 *
 * Memoised: the seed set is tiny (the collaborators in one document) and stable
 * for the length of a session.
 */
const accentCache = new Map<string, string>()

export function idAccent(seed: string, dark?: boolean): string {
	const key = `${dark ? 'd' : 'l'}:${seed}`
	const hit = accentCache.get(key)
	if (hit) return hit
	// Hex, not `lch(...)`: CSS gamut-maps out-of-sRGB chroma per engine, so the same
	// peer would render a different colour in Chrome and Firefox.
	const accent = colord({ l: dark ? 72 : 48, c: 100, h: idHue(seed) }).toHex()
	accentCache.set(key, accent)
	return accent
}

/**
 * Presence colour for a peer: derived from the relay-stamped `idTag` when
 * present, falling back to the client id (pre-sync or guest).
 *
 * Derived by the VIEWER from that idTag rather than read off the wire, so a peer
 * cannot assert an arbitrary colour — and the idTag itself is stamped by the
 * relay from the sender's own token (see
 * `cloudillo-rs/crates/cloudillo-crdt/src/websocket.rs`), so it cannot be forged
 * either. Guests fall back to the awareness clientId, stable for their session.
 *
 * The caller passes the theme, because a hidden bus read cannot appear in a
 * memo's prop comparison or a `useEffect` dep array.
 */
export function presenceColor(idTag: string | undefined, clientId: number, dark: boolean): string {
	return idAccent(idTag ?? String(clientId), dark)
}

/**
 * Cryptographically random base64url string (`length` chars ≈ `length`×6 bits of
 * entropy). Shared by the canvas apps' id generators, app-bus session and toast ids.
 */
export function randomId(length = 12): string {
	const bytes = new Uint8Array(Math.ceil((length * 6) / 8))
	crypto.getRandomValues(bytes)
	return bytesToBase64Url(bytes).slice(0, length)
}

// vim: ts=4
