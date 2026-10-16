// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Layout worker (module Worker, `dist/assets-<v>/layout-worker.js`): mirror Y.Doc →
 * `PublicationAdapter` → `Engine`; posts `fonts`, `pages`, `layout` per pass (protocol.ts).
 * HarfBuzz finds `harfbuzz.wasm` beside this bundle; faces are fetched from `fontBase`.
 */

import { getImageVariantForDisplaySize } from '@cloudillo/core/urls'
import { isFileId } from '@cloudillo/types'
import {
	collectGlyphs,
	createShapeCache,
	cropGeom,
	cropOf,
	Engine,
	FontRegistry,
	FX,
	glyphPath,
	initHarfBuzz,
	loadParagraphFaces,
	type PageDL
} from '@cloudillo/typeset'
import { type PdfDownsample, writePdf } from '@cloudillo/typeset/pdf'
import * as Y from 'yjs'

import { framesOf } from '../crdt/entities'
import type { StoredImageData } from '../crdt/stored-types'
import { readMeta } from '../crdt/type-converters'
import { PublicationAdapter } from './adapter'
import {
	type FaceGlyphs,
	type MainToWorker,
	type PdfExportOptions,
	pageKey,
	type WorkerToMain
} from './protocol'
import { spellCheck, spellConfig, spellSuggest } from './spell'

const registry = new FontRegistry()
const shape = createShapeCache()
const engine = new Engine({ registry, shape })
const mirror = new Y.Doc()
let adapter: PublicationAdapter | undefined
let fontBase = ''
let viewport: [number, number] | undefined
/** `update` messages applied to the mirror (acknowledged by `layout.seq`). */
let applied = 0
let running = false
let dirty = false
/** Idle time after an edit before the deferred tail (full) pass. Tuning constant. */
const TAIL_DELAY_MS = 400
let tail: ReturnType<typeof setTimeout> | undefined
/** What the next pass is: an edit (up to viewport end + 2 pages), the first one, or the tail. */
let pass: 'edit' | 'init' | 'tail' = 'edit'
/** sha256 → gids whose outlines main already has. */
const sent = new Map<string, Set<number>>()

function post(msg: WorkerToMain, transfer: Transferable[] = []): void {
	self.postMessage(msg, { transfer })
}

/** The adapter's stories and spelling meta for `spellCheck`. */
function spellSrc() {
	if (!adapter) return
	const m = readMeta(adapter.doc.m)
	return {
		stories: adapter.storyMap(),
		styles: adapter.styles,
		lang: m.lang,
		ignore: m.spellIgnore ?? []
	}
}

async function fetchBytes(url: string): Promise<ArrayBuffer> {
	const res = await fetch(fontBase + url)
	if (!res.ok) throw new Error(`font ${url}: HTTP ${res.status}`)
	return res.arrayBuffer()
}

/** Outlines of glyphs on these pages that main has not received yet. Before transfer. */
function newGlyphs(pages: PageDL[]): FaceGlyphs[] {
	const faces = new Map<string, FaceGlyphs>()
	for (const pg of pages) {
		for (const { font, gids } of collectGlyphs(pg)) {
			let have = sent.get(font.sha256)
			if (!have) {
				have = new Set()
				sent.set(font.sha256, have)
			}
			for (const gid of gids) {
				if (have.has(gid)) continue
				have.add(gid)
				let f = faces.get(font.sha256)
				if (!f) {
					f = { ref: font, unitsPerEm: font.upem, glyphs: {} }
					faces.set(font.sha256, f)
				}
				f.glyphs[gid] = glyphPath(font, gid)
			}
		}
	}
	return [...faces.values()]
}

/** Buffers of the pages' typed arrays (all freshly allocated per layout pass, never cache views). */
function buffers(pages: PageDL[]): ArrayBuffer[] {
	const set = new Set<ArrayBuffer>()
	const add = (a: ArrayBufferView | undefined) => {
		if (a) set.add(a.buffer as ArrayBuffer)
	}
	for (const pg of pages) {
		for (const it of pg.items) {
			if (it.k !== 'glyphs') continue
			add(it.glyphs)
			add(it.advances)
			add(it.offsets)
			add(it.clusters)
		}
		for (const l of pg.lines) add(l.carets)
	}
	return [...set]
}

async function run(): Promise<void> {
	running = true
	try {
		await initHarfBuzz()
		while (dirty && adapter) {
			dirty = false
			await loadParagraphFaces(adapter.drainFresh(), adapter.styles, registry, fetchBytes)
			// Edits that arrived while loading may need more faces: load again before laying out.
			if (dirty) continue
			const kind = pass
			pass = 'edit'
			const limit =
				kind === 'tail'
					? undefined
					: kind === 'init'
						? (viewport?.[1] ?? 0) + 2
						: viewport && viewport[1] + 2
			const r = engine.layout(viewport, { limit })
			const faces = newGlyphs(r.changed)
			if (faces.length) post({ type: 'fonts', faces })
			if (r.changed.length)
				post({ type: 'pages', rev: r.rev, pages: r.changed }, buffers(r.changed))
			post({
				type: 'layout',
				rev: r.rev,
				seq: applied,
				pageCount: r.pageCount,
				sections: r.sections,
				overset: r.overset
			})
			spellCheck(spellSrc, post)
			// Far pages are the previous pass's: reflow them once typing pauses (init: right away).
			if (r.partial) {
				clearTimeout(tail)
				tail = setTimeout(runTail, kind === 'init' ? 0 : TAIL_DELAY_MS)
			}
		}
	} catch (err) {
		post({ type: 'error', message: err instanceof Error ? err.message : String(err) })
	} finally {
		running = false
	}
}

function runTail(): void {
	pass = 'tail'
	dirty = true
	if (!running) void run()
}

/** An edit postpones the tail pass, and a pending tail pass becomes an edit pass. */
function deferTail(): void {
	clearTimeout(tail)
	if (pass === 'tail') pass = 'edit'
}

/** The running PDF job. */
let job: AbortController | undefined

/** Decode budget for images (pixels); larger ones are scaled down to it. */
const MAX_PX = 40e6
/** Hard ceiling (pixels, from the header): larger images are not decoded at all. */
const MAX_DECODE_PX = 400e6

/** [width, height] from a PNG IHDR or a JPEG SOF header; undefined if not found. */
function headerDims(b: Uint8Array): [number, number] | undefined {
	const v = new DataView(b.buffer, b.byteOffset, b.byteLength)
	if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e)
		return b.length >= 24 ? [v.getUint32(16), v.getUint32(20)] : undefined
	if (b[0] !== 0xff || b[1] !== 0xd8) return
	let i = 2
	while (i + 9 <= b.length && b[i] === 0xff) {
		const m = b[i + 1]
		if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc)
			return [v.getUint16(i + 7), v.getUint16(i + 5)]
		i += 2 + v.getUint16(i + 2)
	}
}

/** JPEG/PNG within MAX_PX pass through; anything else (variants are webp/avif) is re-encoded: JPEG if opaque, else PNG. */
async function jpegOrPng(blob: Blob): Promise<ArrayBuffer> {
	const dims = headerDims(new Uint8Array(await blob.slice(0, 65536).arrayBuffer()))
	if (dims && dims[0] * dims[1] <= MAX_PX) return blob.arrayBuffer()
	if (dims && dims[0] * dims[1] > MAX_DECODE_PX) throw new Error('image too large')
	// Header-less formats (WebP, AVIF) and images under MAX_DECODE_PX are still fully decoded
	// once; a throwaway decode worker is the upgrade path.
	const bmp = await createImageBitmap(blob)
	const { width: w, height: h } = bmp
	const k = Math.min(1, Math.sqrt(MAX_PX / (w * h)))
	const c = new OffscreenCanvas(Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k)))
	const ctx = c.getContext('2d')
	if (!ctx) throw new Error('no 2d context')
	ctx.drawImage(bmp, 0, 0, c.width, c.height)
	// Opacity from a small copy: partial transparency survives the averaging of the downscale.
	const s = Math.min(1, 256 / Math.max(w, h))
	const t = new OffscreenCanvas(Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s)))
	const tctx = t.getContext('2d')
	if (!tctx) throw new Error('no 2d context')
	tctx.drawImage(bmp, 0, 0, t.width, t.height)
	bmp.close()
	const d = tctx.getImageData(0, 0, t.width, t.height).data
	let opaque = true
	for (let i = 3; i < d.length && opaque; i += 4) opaque = d[i] === 255
	const out = await c.convertToBlob(
		opaque ? { type: 'image/jpeg', quality: 0.92 } : { type: 'image/png' }
	)
	return out.arrayBuffer()
}

/**
 * Lays out a composition-free snapshot of the mirror in a separate engine, whole and never
 * `partial`: the editor's engine, its IME composition and its deferred tail stay untouched.
 */
async function exportPdf(o: PdfExportOptions, id: number): Promise<void> {
	job?.abort()
	const ac = new AbortController()
	job = ac
	const signal = ac.signal
	try {
		await initHarfBuzz()
		const snap = new Y.Doc()
		Y.applyUpdate(snap, Y.encodeStateAsUpdate(mirror))
		const eng = new Engine({ registry, shape })
		const ad = new PublicationAdapter(snap, eng)
		await loadParagraphFaces(ad.drainFresh(), ad.styles, registry, fetchBytes)
		signal.throwIfAborted()
		// A fresh engine lists every page as changed, in publication order.
		const all = eng.layout().changed
		const want = o.pages && new Set(o.pages)
		const pages = want ? all.filter((pg) => want.has(pageKey(pg.page.sec, pg.page.index))) : all
		if (want && pages.length !== want.size)
			throw new Error('Pages changed while exporting, please try again')
		if (!pages.length) throw new Error('No pages to export')
		// Source aspect per file: `cover` draws the whole image larger than its box.
		const aspect = new Map<string, number>()
		for (const [, f] of framesOf(ad.doc)) {
			if (f.t !== 'img') continue
			const d = f.data as StoredImageData
			if (d.fileId && d.px) aspect.set(d.fileId, d.px[0] / d.px[1])
		}
		// Largest drawn size (Fx) of each image: picks the variant for the requested dpi.
		const sizes = new Map<string, number>()
		for (const pg of pages) {
			for (const it of pg.items) {
				if (it.k !== 'image') continue
				const { full } = cropGeom(it.box, cropOf(it.crop), it.fit, aspect.get(it.fileId))
				const s = Math.max(full.w, full.h)
				sizes.set(it.fileId, Math.max(sizes.get(it.fileId) ?? 0, s))
			}
		}
		const fetchImage = async (fileId: string, ds: PdfDownsample) => {
			if (!isFileId(fileId)) throw new Error(`image ${fileId}: bad file id`)
			const url = (variant?: string) => {
				const q = new URLSearchParams()
				if (variant) q.set('variant', variant)
				return `${o.files.api}/files/${encodeURIComponent(fileId)}${q.size ? `?${q}` : ''}`
			}
			const headers = o.files.token ? { Authorization: `Bearer ${o.files.token}` } : undefined
			const px = ds === 'none' ? 0 : ((sizes.get(fileId) ?? 0) / FX / 72) * Number(ds)
			let res = await fetch(url(px ? getImageVariantForDisplaySize(px, px) : undefined), {
				signal,
				headers
			})
			// No such variant (e.g. a small original): the original.
			if (!res.ok && px) res = await fetch(url(), { signal, headers })
			if (!res.ok) throw new Error(`image ${fileId}: HTTP ${res.status}`)
			return jpegOrPng(await res.blob())
		}
		const missing = new Set<string>()
		const bytes = await writePdf(
			pages,
			{
				title: o.title,
				lang: readMeta(ad.doc.m).lang,
				pdfa: o.pdfa,
				downsample: o.downsample
			},
			{
				fonts: fetchBytes,
				fetchImage,
				onMissingImage: (fileId) => missing.add(fileId),
				embeds: o.embeds,
				signal,
				onProgress: (done, total) => {
					if (!signal.aborted) post({ type: 'pdf.progress', id, done, total })
				}
			}
		)
		signal.throwIfAborted()
		post({
			type: 'pdf.done',
			id,
			blob: new Blob([bytes as BlobPart], { type: 'application/pdf' }),
			missing: missing.size
		})
	} catch (err) {
		if (!signal.aborted)
			post({
				type: 'pdf.error',
				id,
				message: err instanceof Error ? err.message : String(err)
			})
	} finally {
		if (job === ac) job = undefined
	}
}

self.onmessage = (e: MessageEvent<MainToWorker>) => {
	const msg = e.data
	switch (msg.type) {
		case 'pdf.export':
			if (adapter) void exportPdf(msg.options, msg.id)
			else post({ type: 'pdf.error', id: msg.id, message: 'Layout not ready' })
			return
		case 'pdf.cancel':
			job?.abort()
			return
		case 'spell.config':
			spellConfig(msg.on, msg.words)
			spellCheck(spellSrc, post)
			return
		case 'spell.suggest':
			void spellSuggest(msg.word, msg.lang).then((words) =>
				post({ type: 'spell.suggestions', id: msg.id, words })
			)
			return
		case 'init':
			fontBase = msg.fontBase
			Y.applyUpdate(mirror, msg.update)
			adapter = new PublicationAdapter(mirror, engine)
			pass = 'init'
			break
		case 'update':
			Y.applyUpdate(mirror, msg.u)
			applied++
			deferTail()
			break
		case 'viewport':
			// Ordering hint for the next pass only; nothing to relayout.
			viewport = msg.pages
			return
		case 'compose':
			if (!adapter) return
			adapter.compose(msg)
			deferTail()
			break
	}
	dirty = true
	if (!running) void run()
}

// vim: ts=4
