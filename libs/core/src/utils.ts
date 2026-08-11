// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Delay execution for a specified time
 */
export async function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

import { colord, extend } from 'colord'
import lchPlugin from 'colord/plugins/lch'

extend([lchPlugin])

export async function calcSha1Hex(str: string) {
	// Generate SHA hash from str
	const enc = new TextEncoder()
	const data = enc.encode(str)
	return Array.from(new Uint8Array(await window.crypto.subtle.digest('sha-1', data)))
		.map((byte) => byte.toString(16).padStart(2, '0'))
		.join('')
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
	const accent = colord({ l: dark ? 72 : 48, c: 100, h: idHue(seed) }).toHex()
	accentCache.set(key, accent)
	return accent
}

/**
 * @deprecated Use {@link idHue} with the `.c-id-color` CSS rules, or
 * {@link idAccent} where a literal string is required.
 *
 * Behaviour changed: the hue now derives from {@link idHue} (FNV-1a), not SHA-1 —
 * colours differ from earlier releases for the same input.
 */
export async function str2color(
	str: string,
	l: number = 40,
	c: number = 100,
	dark?: boolean
): Promise<string> {
	return colord({ l: dark ? 100 - l : l, c, h: idHue(str) }).toHex()
}

/**
 * @deprecated Returns two unrelated hues. Use {@link idHue} with the
 * `.c-id-color` CSS rules, which pick a fill and a foreground that contrast.
 *
 * Behaviour changed: both hues now derive from {@link idHue} (FNV-1a), not SHA-1 —
 * colours differ from earlier releases for the same input.
 */
export async function str2colors(
	str: string,
	l: number = 40,
	c: number = 100,
	dark?: boolean
): Promise<{ fg: string; bg: string }> {
	const lightness = dark ? 100 - l : l

	return {
		fg: colord({ l: lightness, c, h: idHue(str) }).toHex(),
		bg: colord({ l: lightness, c, h: idHue(`${str} bg`) }).toHex()
	}
}

// vim: ts=4
