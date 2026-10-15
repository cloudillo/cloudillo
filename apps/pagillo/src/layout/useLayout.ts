// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * React binding of the layout worker, plus the determinism meta: a newer running engine
 * writes `m.engine`, an older one reports `readOnlyReason: 'engine'`; `m.fonts` (font file →
 * sha256 of every face laid out) differing from the bundled fonts latches `fontsChanged`.
 */

import { FONT_METRICS } from '@cloudillo/fonts/font-metrics'
import { ENGINE_VERSION, type EngineLayout, glyphId, type PageDL } from '@cloudillo/typeset'
import * as React from 'react'
import type * as Y from 'yjs'

import { openPublication, setMeta } from '../crdt/document'
import { readMeta } from '../crdt/type-converters'
import type { YPagilloDocument } from '../crdt/stored-types'
import { type Composition, pageKey, type SpellRange, type WorkerToMain } from '../worker/protocol'
import { type LayoutHost, startLayoutWorker } from './worker-host'

export { pageKey } from '../worker/protocol'

export interface LayoutState {
	/** Current page display lists by `pageKey(sec, index)`; a new Map whenever any page changed. */
	pages: Map<string, PageDL>
	pageCount: number
	/** Page count per section, in flow order. */
	sections: EngineLayout['sections']
	overset: EngineLayout['overset']
	/** No layout yet, or the worker has not caught up with the latest Y update. */
	pending: boolean
	/** `glyphId(font, gid)` → outline path (font units, y up: draw with `scale(1 -1)`). */
	glyphDefs: Map<string, string>
	/** Worker / WASM / font failure message; sticky — the engine stopped. */
	failed?: string
	/** `'engine'`: a newer engine wrote `m.engine`; editing must stop until reload. */
	readOnlyReason?: 'engine'
	/** Bundled font hashes differ from `m.fonts` (dismissible banner); latched. */
	fontsChanged: boolean
	/** Global page indices `[from, to)` on screen, laid out / sent first. */
	setViewport(pages: [number, number]): void
	/** Show (`text: ''` clears) a local IME composition in the layout (worker `compose`). */
	compose(c: Composition): void
	/** Misspellings (worker `spell`): story → paragraph bid → paragraph-relative ranges. */
	spell: Map<string, Map<string, SpellRange[]>>
	/** Spell checking on/off and the user's dictionary words; re-sent to a restarted worker. */
	setSpell(on?: boolean, words?: string[]): void
	/** Suggestions for a misspelt word (`SpellRange.lang`). */
	suggest(word: string, lang: string): Promise<string[]>
}

interface Snapshot {
	pages: Map<string, PageDL>
	pageCount: number
	sections: EngineLayout['sections']
	overset: EngineLayout['overset']
	glyphDefs: Map<string, string>
}

const EMPTY: Snapshot = {
	pages: new Map(),
	pageCount: 0,
	sections: [],
	overset: [],
	glyphDefs: new Map()
}

/** Numeric semver compare (prerelease tags ignored). */
function compareVersions(a: string, b: string): number {
	const pa = a.split('.').map((n) => Number.parseInt(n, 10) || 0)
	const pb = b.split('.').map((n) => Number.parseInt(n, 10) || 0)
	for (let i = 0; i < 3; i++) {
		const d = (pa[i] ?? 0) - (pb[i] ?? 0)
		if (d) return Math.sign(d)
	}
	return 0
}

/** A newer engine than ours wrote `m.engine`: this client must not write (read synchronously). */
export function newerEngine(doc: YPagilloDocument): boolean {
	const engine = doc.m.get('engine')
	return typeof engine === 'string' && compareVersions(ENGINE_VERSION, engine) < 0
}

export function useLayout(
	yDoc: Y.Doc | undefined,
	{ synced, canWrite }: { synced: boolean; canWrite: boolean }
): LayoutState {
	const [snap, setSnap] = React.useState<Snapshot>(EMPTY)
	const [pending, setPending] = React.useState(true)
	const [failed, setFailed] = React.useState<string>()
	const [readOnlyReason, setReadOnlyReason] = React.useState<'engine'>()
	const [fontsChanged, setFontsChanged] = React.useState(false)
	/** Faces laid out so far: file → sha256 (to record in `m.fonts`). */
	const usedFonts = React.useRef(new Map<string, string>())
	const [fontsSeen, setFontsSeen] = React.useState(0)
	const host = React.useRef<LayoutHost | undefined>(undefined)
	const [spell, setSpellMap] = React.useState(() => new Map<string, Map<string, SpellRange[]>>())
	/** Last spell config, sent to each new worker. */
	const spellCfg = React.useRef<{ on: boolean; words: string[] }>({ on: false, words: [] })

	React.useEffect(() => {
		if (!yDoc) return
		setSnap(EMPTY)
		setPending(true)
		setFailed(undefined)
		usedFonts.current = new Map()
		setSpellMap(new Map())
		let spellMap = new Map<string, Map<string, SpellRange[]>>()
		let spellFlush: ReturnType<typeof setTimeout> | undefined
		let pages = EMPTY.pages
		let glyphs = EMPTY.glyphDefs
		let sections = EMPTY.sections
		let pagesCopied = false
		let glyphsCopied = false
		const onMessage = (msg: WorkerToMain) => {
			switch (msg.type) {
				case 'fonts': {
					if (!glyphsCopied) glyphs = new Map(glyphs)
					glyphsCopied = true
					let newFace = false
					for (const f of msg.faces) {
						if (!usedFonts.current.has(f.ref.file)) newFace = true
						usedFonts.current.set(f.ref.file, f.ref.sha256)
						for (const [gid, d] of Object.entries(f.glyphs))
							glyphs.set(glyphId(f.ref, Number(gid)), d)
					}
					if (newFace) setFontsSeen((n) => n + 1)
					break
				}
				case 'pages':
					if (!pagesCopied) pages = new Map(pages)
					pagesCopied = true
					for (const pg of msg.pages) pages.set(pageKey(pg.page.sec, pg.page.index), pg)
					break
				case 'layout': {
					// Gone pages are not reported: drop indices past each section's count.
					const counts = new Map(msg.sections.map((s) => [s.id, s.pages]))
					for (const [k, pg] of pages) {
						if (pg.page.index >= (counts.get(pg.page.sec) ?? 0)) {
							if (!pagesCopied) pages = new Map(pages)
							pagesCopied = true
							pages.delete(k)
						}
					}
					pagesCopied = glyphsCopied = false
					// Same ids/counts → keep the array, so `sections` memos downstream hold.
					const s = msg.sections
					if (
						s.length !== sections.length ||
						s.some((x, i) => x.id !== sections[i].id || x.pages !== sections[i].pages)
					)
						sections = s
					setSnap({
						pages,
						pageCount: msg.pageCount,
						sections,
						overset: msg.overset,
						glyphDefs: glyphs
					})
					setPending(msg.seq < (host.current?.sent ?? 0))
					break
				}
				case 'spell': {
					spellMap = new Map(spellMap)
					const m = new Map(spellMap.get(msg.story))
					if (msg.ranges.length) m.set(msg.bid, msg.ranges)
					else m.delete(msg.bid)
					spellMap.set(msg.story, m)
					// A first pass posts many paragraphs: one render per burst.
					spellFlush ??= setTimeout(() => {
						spellFlush = undefined
						setSpellMap(spellMap)
					}, 50)
					break
				}
				case 'error':
					setFailed(msg.message)
					setPending(false)
					break
			}
		}
		const h = startLayoutWorker(yDoc, onMessage)
		host.current = h
		h.setSpell(spellCfg.current.on, spellCfg.current.words)
		const onUpdate = () => setPending(true)
		yDoc.on('update', onUpdate)
		return () => {
			yDoc.off('update', onUpdate)
			clearTimeout(spellFlush)
			h.dispose()
			if (host.current === h) host.current = undefined
		}
	}, [yDoc])

	// Engine skew, re-checked on every `m` change (a newer collaborator may join).
	React.useEffect(() => {
		if (!yDoc || !synced) return
		const doc = openPublication(yDoc)
		const check = () => {
			const stored = doc.m.get('engine') as string | undefined
			const cmp = stored ? compareVersions(ENGINE_VERSION, stored) : 1
			setReadOnlyReason(cmp < 0 ? 'engine' : undefined)
			if (cmp > 0 && canWrite) setMeta(yDoc, doc, { engine: ENGINE_VERSION })
			const fonts = readMeta(doc.m).fonts ?? {}
			if (Object.entries(fonts).some(([file, sha]) => FONT_METRICS[file]?.sha256 !== sha))
				setFontsChanged(true)
		}
		check()
		doc.m.observe(check)
		return () => doc.m.unobserve(check)
	}, [yDoc, synced, canWrite])

	// Record the hashes of the faces laid out (`fontsSeen` signals new `usedFonts` entries).
	// Declared after the check so a mismatch latches before our own write hides it.
	React.useEffect(() => {
		if (!yDoc || !synced || !canWrite || readOnlyReason) return
		const doc = openPublication(yDoc)
		// `readOnlyReason` is only queued on first sync, so re-check the skew synchronously.
		if (newerEngine(doc)) return
		const stored = readMeta(doc.m).fonts ?? {}
		const add = [...usedFonts.current].filter(([file, sha]) => stored[file] !== sha)
		// `setMeta` merges entries into the `fonts/<file>` keys.
		if (add.length) setMeta(yDoc, doc, { fonts: Object.fromEntries(add) })
	}, [yDoc, synced, canWrite, readOnlyReason, fontsSeen])

	const setViewport = React.useCallback((p: [number, number]) => {
		host.current?.setViewport(p)
	}, [])
	const compose = React.useCallback((c: Composition) => {
		host.current?.compose(c)
	}, [])

	const setSpell = React.useCallback((on?: boolean, words?: string[]) => {
		if (on !== undefined) spellCfg.current.on = on
		if (words) spellCfg.current.words = words
		host.current?.setSpell(on, words)
	}, [])
	const suggest = React.useCallback(
		(word: string, lang: string) => host.current?.suggest(word, lang) ?? Promise.resolve([]),
		[]
	)

	return {
		...snap,
		pending,
		failed,
		readOnlyReason,
		fontsChanged,
		setViewport,
		compose,
		spell,
		setSpell,
		suggest
	}
}

// vim: ts=4
