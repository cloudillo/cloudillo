// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { FontRef, PageDL } from '../display-list.js'
import { type FetchBytes, fontUrl } from '../fonts/loader.js'
import { embedFace, type PdfDoc, type PdfFace } from './glyph-ops.js'

/** The same TTF bytes the engine shaped with: fetched from `fontUrl(ref)`, sha256-checked. */
async function faceBytes(ref: FontRef, fetchBytes: FetchBytes): Promise<Uint8Array> {
	const bytes = await fetchBytes(fontUrl(ref))
	const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
	const hex = [...digest].map((b) => b.toString(16).padStart(2, '0')).join('')
	if (hex !== ref.sha256) throw new Error(`typeset: sha256 mismatch for ${ref.file}`)
	return new Uint8Array(bytes)
}

/**
 * Embed every face the pages' glyph runs use, keyed by `FontRef.sha256`. Faces are registered in
 * order of first use, so `/F<n>` names are deterministic.
 */
export async function embedFonts(
	doc: PdfDoc,
	pages: PageDL[],
	fetchBytes: FetchBytes
): Promise<Map<string, PdfFace>> {
	const refs = new Map<string, FontRef>()
	for (const p of pages) {
		for (const it of p.items) {
			if (it.k === 'glyphs' && !refs.has(it.font.sha256)) refs.set(it.font.sha256, it.font)
		}
	}
	const bytes = await Promise.all([...refs.values()].map((ref) => faceBytes(ref, fetchBytes)))
	const faces = new Map<string, PdfFace>()
	let i = 0
	for (const sha of refs.keys()) faces.set(sha, embedFace(doc, bytes[i++]))
	return faces
}
