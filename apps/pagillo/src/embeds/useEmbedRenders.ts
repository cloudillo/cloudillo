// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Render SVGs of the embeds on screen, in memory only (never written to the Y.Doc). A
 * `PageCanvas` calls `want` for each `embed` item of its page; the render is cached by
 * `(address, box)` and handed to `drawPage` as an `HTMLImageElement` (blob URL, fonts inlined:
 * an SVG drawn as an image loads nothing external). A resized frame keeps showing its old image,
 * scaled, until the new render arrives. `renderEmbed` output is already `sanitizeSvg`'d.
 */

import { getAppBus, renderEmbed } from '@cloudillo/core'
import { inlineSvgFonts } from '@cloudillo/fonts'
import * as React from 'react'

import { frameOf } from '../crdt/entities'
import { embedRecordAt, findInlineImage } from '../crdt/frame-ops'
import type { YPagilloDocument } from '../crdt/stored-types'
import { type EmbedRecord, embedTarget, fxToCssPx } from './record'

export interface EmbedRenders {
	/** Latest render per DL embed `frameId` (an `emb` frame id, or an inline embed's paragraph bid). */
	images: Map<string, HTMLImageElement>
	/** A page shows DL embed `frameId` with box `w`×`h` (Fx): render it unless cached. */
	want(frameId: string, w: number, h: number): void
	/**
	 * Render the embed behind `frameId` again (deactivate, Refresh): every frame showing its
	 * address re-renders, a sticky failure included; the old image stays until the new one.
	 */
	refresh(frameId: string): void
}

/** Provided by `app.tsx`, read by `PageCanvas` (editor pages and thumbnails alike). */
export const EmbedRendersContext = React.createContext<EmbedRenders | undefined>(undefined)

/** Quiet time after the last box change (resize release) before rendering. */
const RENDER_DELAY = 300
/** Renders in flight at once (each boots a hidden source iframe). */
const CONCURRENCY = 2
/** Distinct renders started per hook instance (a peer can plant any number of embeds). */
export const MAX_RENDERS = 64

/** The embed record behind DL embed `frameId`: an `emb` frame's data, or an inline `{ emb }`. */
export function embedRecordOf(doc: YPagilloDocument, frameId: string): EmbedRecord | undefined {
	const f = frameOf(doc, frameId)
	if (f) return f.t === 'emb' ? (f.data as EmbedRecord) : undefined
	const at = findInlineImage(doc, frameId, 'emb')
	const t = at && doc.tx.get(at.story)
	return t && at ? embedRecordAt(t, at.offset) : undefined
}

/** A cache entry: `img` once loaded, `{}` while rendering, `failed` after an error. */
interface Entry {
	img?: HTMLImageElement
	url?: string
	failed?: true
}

function loadImage(url: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const img = new Image()
		img.onload = () => resolve(img)
		img.onerror = () => reject(new Error('embed render did not load as an image'))
		img.src = url
	})
}

export function useEmbedRenders(doc: YPagilloDocument, sourceFileId?: string): EmbedRenders {
	const [images, setImages] = React.useState(() => new Map<string, HTMLImageElement>())
	/** Refresh generation per address (part of the cache key). */
	const [gens, setGens] = React.useState(() => new Map<string, number>())
	const st = React.useRef({
		cache: new Map<string, Entry>(),
		/** frameId → key of the image shown / of the render it waits for. */
		shown: new Map<string, string>(),
		due: new Map<string, string>(),
		timers: new Map<string, ReturnType<typeof setTimeout>>(),
		/** frameId → last box asked for (the doc-update re-ask below). */
		boxes: new Map<string, { w: number; h: number }>(),
		running: 0,
		/** Renders started (`MAX_RENDERS`). */
		started: 0,
		queue: [] as (() => void)[],
		abort: new AbortController()
	}).current

	React.useEffect(
		() => () => {
			st.abort.abort()
			for (const id of st.timers.values()) clearTimeout(id)
			for (const e of st.cache.values()) if (e.url) URL.revokeObjectURL(e.url)
		},
		[st]
	)

	const show = React.useCallback(
		(frameId: string, key: string, img: HTMLImageElement) => {
			const old = st.shown.get(frameId)
			st.shown.set(frameId, key)
			setImages((m) => new Map(m).set(frameId, img))
			if (!old || old === key || [...st.shown.values()].includes(old)) return
			const e = st.cache.get(old)
			if (e?.url) URL.revokeObjectURL(e.url)
			st.cache.delete(old)
		},
		[st]
	)

	const render = React.useCallback(
		async (key: string, rec: EmbedRecord, w: number, h: number) => {
			const tg = embedTarget(rec)
			if (!tg) {
				st.cache.set(key, { failed: true })
				return
			}
			if (!sourceFileId) return
			// per-session cap; per-viewport scheduling if real documents exceed it.
			if (++st.started > MAX_RENDERS) {
				st.cache.set(key, { failed: true })
				return
			}
			st.cache.set(key, {})
			if (st.running >= CONCURRENCY) await new Promise<void>((r) => st.queue.push(r))
			st.running++
			let url: string | undefined
			try {
				const r = await renderEmbed({
					bus: getAppBus(),
					targetFileId: tg.fileId,
					targetContentType: tg.contentType,
					sourceFileId,
					nav: tg.nav,
					page: { w: fxToCssPx(w), h: fxToCssPx(h) },
					signal: st.abort.signal
				})
				if (!r.pages[0]) throw new Error('empty render')
				const svg = await inlineSvgFonts(r.pages[0])
				url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
				const img = await loadImage(url)
				st.cache.set(key, { img, url })
				for (const [frameId, k] of st.due) {
					if (k !== key) continue
					st.due.delete(frameId)
					show(frameId, key, img)
				}
			} catch (err) {
				if (!st.abort.signal.aborted) console.warn('[pagillo] embed render failed:', err)
				if (url) URL.revokeObjectURL(url)
				// A failure sticks for this key; `refresh` moves the address to a new key.
				st.cache.set(key, { failed: true })
			} finally {
				st.running--
				st.queue.shift()?.()
			}
		},
		[st, sourceFileId, show]
	)

	const want = React.useCallback(
		(frameId: string, w: number, h: number) => {
			st.boxes.set(frameId, { w, h })
			const rec = embedRecordOf(doc, frameId)
			if (!rec?.address || !sourceFileId) return
			const key = `${rec.address}|${w}x${h}|${gens.get(rec.address) ?? 0}`
			if (st.shown.get(frameId) === key) {
				st.due.delete(frameId)
				return
			}
			if (st.due.get(frameId) === key) return
			const e = st.cache.get(key)
			if (e?.img) {
				st.due.delete(frameId)
				show(frameId, key, e.img)
				return
			}
			if (e?.failed) return
			st.due.set(frameId, key)
			if (e) return // already rendering: `render` shows it to every frame due it
			clearTimeout(st.timers.get(frameId))
			st.timers.set(
				frameId,
				setTimeout(() => {
					st.timers.delete(frameId)
					if (st.due.get(frameId) === key && !st.cache.has(key))
						void render(key, rec, w, h)
				}, RENDER_DELAY)
			)
		},
		[doc, st, show, render, gens, sourceFileId]
	)

	// The DL embed item carries no address, so `samePage` keeps the page across address edits
	// and `PageCanvas` never re-asks: re-ask every known frame after the doc changes.
	React.useEffect(() => {
		const y = doc.f.doc
		if (!y) return
		let t: ReturnType<typeof setTimeout> | undefined
		const on = () => {
			clearTimeout(t)
			t = setTimeout(() => {
				for (const [id, b] of st.boxes) want(id, b.w, b.h)
			}, RENDER_DELAY)
		}
		y.on('update', on)
		return () => {
			clearTimeout(t)
			y.off('update', on)
		}
	}, [doc, st, want])

	// an older generation's render still in flight lands in the cache unshown and is
	// only revoked on unmount; prune by generation if Refresh gets spammed.
	const refresh = React.useCallback(
		(frameId: string) => {
			const a = embedRecordOf(doc, frameId)?.address
			if (a) setGens((m) => new Map(m).set(a, (m.get(a) ?? 0) + 1))
		},
		[doc]
	)

	return React.useMemo(() => ({ images, want, refresh }), [images, want, refresh])
}

// vim: ts=4
