// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Layout worker (module Worker, `dist/assets-<v>/layout-worker.js`): mirror Y.Doc →
 * `PublicationAdapter` → `Engine`; posts `fonts`, `pages`, `layout` per pass (protocol.ts).
 * HarfBuzz finds `harfbuzz.wasm` beside this bundle; faces are fetched from `fontBase`.
 */

import * as Y from 'yjs'
import {
	collectGlyphs,
	createShapeCache,
	Engine,
	FontRegistry,
	glyphPath,
	initHarfBuzz,
	loadParagraphFaces,
	type PageDL
} from '@cloudillo/typeset'

import { PublicationAdapter } from './adapter'
import type { FaceGlyphs, MainToWorker, WorkerToMain } from './protocol'

const registry = new FontRegistry()
const engine = new Engine({ registry, shape: createShapeCache() })
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

self.onmessage = (e: MessageEvent<MainToWorker>) => {
	const msg = e.data
	switch (msg.type) {
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
