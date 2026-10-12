// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { Font } from 'harfbuzzjs'
import type { FontRef } from '../display-list.js'
import { harfBuzz } from '../shape/hb.js'

/** Injectable byte source: node tests read from disk, browsers `fetch`. */
export type FetchBytes = (url: string) => Promise<ArrayBuffer>

const pending = new Map<string, Promise<Font>>()
const loaded = new Map<string, Font>()
const paths = new Map<string, string>()

/** URL of a face's TTF, origin-relative (`/fonts/<dir>/<File>.ttf`). */
export function fontUrl(ref: FontRef): string {
	return `/fonts/${ref.file}`
}

/** Load a face once per sha256; concurrent callers share the same promise. */
export function loadFace(ref: FontRef, fetchBytes: FetchBytes): Promise<Font> {
	let p = pending.get(ref.sha256)
	if (!p) {
		p = fetchBytes(fontUrl(ref)).then(async (bytes) => {
			const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
			const hex = [...digest].map((b) => b.toString(16).padStart(2, '0')).join('')
			if (hex !== ref.sha256) throw new Error(`typeset: sha256 mismatch for ${ref.file}`)
			const hb = harfBuzz()
			// Variations are never applied: residual fvar axes stay at the default instance.
			const font = new hb.Font(new hb.Face(new hb.Blob(bytes)))
			loaded.set(ref.sha256, font)
			return font
		})
		p.catch(() => pending.delete(ref.sha256))
		pending.set(ref.sha256, p)
	}
	return p
}

/** The hb font for an already loaded face; throws if `loadFace` has not resolved yet. */
export function loadedFont(ref: FontRef): Font {
	const font = loaded.get(ref.sha256)
	if (!font) throw new Error(`typeset: font not loaded: ${ref.file}`)
	return font
}

/** SVG path of a glyph in font units, y up (the renderer flips it). Cached. */
export function glyphPath(ref: FontRef, gid: number): string {
	const key = `${ref.sha256}:${gid}`
	let d = paths.get(key)
	if (d === undefined) {
		d = loadedFont(ref).glyphToPath(gid)
		paths.set(key, d)
	}
	return d
}
