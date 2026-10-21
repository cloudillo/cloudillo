// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * Local editor state: selection, input adapter, key commands, pointer selection, IME
 * composition (worker `compose`) and the optimistic caret echo. Readers get the same
 * caret/selection model with a keys-only focus target.
 */

import { FX, type PageDL } from '@cloudillo/typeset'
import * as React from 'react'
import type * as Y from 'yjs'

import type { YPagilloDocument } from '../crdt/stored-types'
import type { LayoutState } from '../layout/useLayout'
import { flattenPages, type PageHit } from '../view/PageList'
import type { Composition } from '../worker/protocol'
import * as C from './caret'
import { applyNextStyle } from './commands'
import { hitText, textAreas } from './hit-test'
import {
	type ComposePhase,
	createInputAdapter,
	type InputAdapter,
	type InputSink
} from './input/adapter'
import { IS_MAC } from './keymap'
import { Overlay } from './Overlay'
import { deleteRange, insertText } from './text-edit'

export interface EditorOptions {
	yDoc: Y.Doc
	doc: YPagilloDocument
	layout: LayoutState
	/** Text input adapter (write access + touch rule); otherwise key commands only. */
	canInput: boolean
	/** Accessible name of the hidden input element. */
	label: string
	/** An edit refused because `layout.readOnlyReason` is set (linked text wires this later). */
	onRefusedEdit?(story: string): void
	/** Command keys the editor's own switch does not handle (`keymap.ts`). */
	onKey?(e: KeyboardEvent): boolean
}

export interface Editor {
	sel?: C.EditorSelection
	index: C.GeomIndex
	/** Global page index of the caret (selection head), for `PageList`'s `pinned`. */
	caretPage?: number
	select(s: C.EditorSelection): void
	/** Drop the selection and caret (Esc in the main story). */
	clear(): void
	/**
	 * One local transaction on the selection's story (refused without input or while
	 * `readOnlyReason`); a returned number collapses the selection there, else it stays.
	 */
	run(fn: (t: Y.Text, from: number, to: number) => number | undefined): boolean
	/** The `run` guard alone (input allowed, no `readOnlyReason`), for multi-story edits. */
	canEdit(story: string): boolean
	/** Focus the text input again (after a toolbar command). */
	focus(): void
	/** `PageList` overlay render prop. */
	overlay(index: number, size: { w: number; h: number }): React.ReactNode
	/** `PageList` pointer callback. */
	onPointer(type: 'down' | 'move' | 'up' | 'cancel', hit: PageHit, e: React.PointerEvent): void
	/**
	 * Right-click at `hit`: on text, puts the caret there (unless inside the selection) and
	 * returns true (the caller opens the text menu); elsewhere false.
	 */
	contextMenu(hit: PageHit): boolean
	/** Last caret box in client px (keyboard-opened text menu). */
	caretRect(): DOMRect | undefined
}

type Echo = C.CaretBox & { pages: Map<string, PageDL> }

export function useEditor({
	yDoc,
	doc,
	layout,
	canInput,
	label,
	onRefusedEdit,
	onKey
}: EditorOptions): Editor {
	const [sel, setSel] = React.useState<C.EditorSelection>()
	const [comp, setComp] = React.useState<Composition>()
	const [echo, setEcho] = React.useState<Echo>()
	const [reveal, setReveal] = React.useState(0)
	const goalX = React.useRef<number | undefined>(undefined)
	const adapter = React.useRef<InputAdapter | undefined>(undefined)
	const drag = React.useRef<
		{ story: string; anchor: number; head: number; unit?: 'word' | 'para' } | undefined
	>(undefined)
	const clicks = React.useRef({ t: 0, x: 0, y: 0, n: 0 })
	const caretRect = React.useRef<DOMRect | undefined>(undefined)

	const keys = React.useMemo(
		() => flattenPages(layout.sections).map((p) => p.key),
		[layout.sections]
	)
	const index = React.useMemo(
		() => C.indexGeom(layout.pages, keys, doc),
		[layout.pages, keys, doc]
	)
	// The echo stands until the worker has caught up with our edits.
	const liveEcho = echo && (echo.pages === layout.pages || layout.pending) ? echo : undefined

	/** Latest values for handlers called between renders (fast typing, IME bursts). */
	const cur = React.useRef({ sel, comp, echo: liveEcho })
	cur.current = { sel, comp, echo: liveEcho }

	// Remote edits shift the local selection (our own writes set it explicitly).
	const story = sel?.story
	React.useEffect(() => {
		const t = story ? doc.tx.get(story) : undefined
		if (!t) return
		const obs = (e: Y.YTextEvent, tr: Y.Transaction) => {
			if (tr.origin === yDoc.clientID) return
			const map = (s: C.EditorSelection | undefined) =>
				s && s.story === story
					? {
							...s,
							anchor: C.mapOffset(e.delta, s.anchor),
							head: C.mapOffset(e.delta, s.head)
						}
					: s
			cur.current.sel = map(cur.current.sel)
			setSel(map)
		}
		t.observe(obs)
		return () => t.unobserve(obs)
	}, [doc, yDoc, story])

	const lines = (id: string) => index.stories.get(id) ?? []
	const textOf = (id: string) => {
		const t = doc.tx.get(id)
		return t ? C.storyText(t) : ''
	}

	const select = (s: C.EditorSelection, keepGoal = false) => {
		if (!keepGoal) goalX.current = undefined
		cur.current.sel = s
		// An explicit selection drops the optimistic caret (a click right after typing).
		cur.current.echo = undefined
		setEcho(undefined)
		setSel(s)
		setReveal((n) => n + 1)
	}

	/** Whether a local edit of `story` may run now (reports a `readOnlyReason` refusal). */
	const canEdit = (story: string): boolean => {
		if (!canInput) return false
		if (layout.readOnlyReason) {
			onRefusedEdit?.(story)
			return false
		}
		return true
	}

	/** One local transaction on the selection's story; `fn` returns the new caret. */
	const edit = (fn: (t: Y.Text, from: number, to: number) => number | undefined): boolean => {
		const s = cur.current.sel
		if (!s || !canEdit(s.story)) return false
		const t = doc.tx.get(s.story)
		if (!t) return false
		let caret: number | undefined
		yDoc.transact(() => {
			caret = fn(t, C.selFrom(s), C.selTo(s))
		}, yDoc.clientID)
		if (caret !== undefined) select({ story: s.story, anchor: caret, head: caret })
		else setReveal((n) => n + 1)
		return true
	}

	const insert = (text: string) => {
		const s = cur.current.sel
		let next: Echo | undefined
		if (s && s.anchor === s.head && !text.includes('\n')) {
			const base = cur.current.echo ?? C.caretBox(lines(s.story), s.head)
			if (base) {
				const dl = layout.pages.get(keys[base.page])
				let x = base.x
				for (const ch of text) x += C.glyphAdvance(dl, ch, 5 * FX)
				next = { ...base, x, pages: layout.pages }
			}
		}
		if (
			!edit((t, from, to) => {
				deleteRange(t, from, to)
				return insertText(t, from, text)
			})
		)
			return
		cur.current.echo = next
		setEcho(next)
	}

	const del = (dir: -1 | 1, unit: 'char' | 'word') => {
		edit((t, from, to) => {
			let [a, b] = [from, to]
			if (a === b) {
				const txt = C.storyText(t)
				const end = C.storyEnd(txt)
				const o = unit === 'word' ? C.wordMove(txt, a, dir) : C.charMove(txt, a, dir, end)
				if (dir < 0) a = o
				else b = Math.min(o, end)
			}
			deleteRange(t, a, b)
			return a
		})
	}

	const compose = (phase: ComposePhase, text: string) => {
		const s = cur.current.sel
		if (!s) return
		if (phase === 'start') {
			if (s.anchor !== s.head)
				edit((t, from, to) => {
					deleteRange(t, from, to)
					return from
				})
			return
		}
		if (phase === 'update') {
			// Refused input shows no composition either.
			if (!canInput || layout.readOnlyReason) return
			const c = { story: s.story, offset: C.selFrom(s), text }
			cur.current.comp = c
			setComp(c)
			layout.compose(c)
			return
		}
		const c = cur.current.comp
		// Clear before the commit's Y update so the worker never lays out both.
		if (c) layout.compose({ ...c, text: '' })
		cur.current.comp = undefined
		setComp(undefined)
		if (phase === 'commit' && text) insert(text)
	}

	const key = (e: KeyboardEvent): boolean => {
		const s = cur.current.sel
		if (!s) return onKey?.(e) ?? false
		const mod = IS_MAC ? e.metaKey : e.ctrlKey
		const word = IS_MAC ? e.altKey : e.ctrlKey
		const ls = lines(s.story)
		let txtMemo: string | undefined
		const txt = () => (txtMemo ??= textOf(s.story))
		const end = () => C.storyEnd(txt())
		const move = (head: number, keepGoal = false) => {
			const h = Math.max(0, Math.min(end(), head))
			select(
				e.shiftKey ? { ...s, head: h } : { story: s.story, anchor: h, head: h },
				keepGoal
			)
			return true
		}
		const goal = () => {
			goalX.current ??= C.caretBox(ls, s.head)?.x ?? 0
			return goalX.current
		}
		const collapsed = s.anchor === s.head
		switch (e.key) {
			case 'ArrowLeft':
			case 'ArrowRight': {
				const dir = e.key === 'ArrowLeft' ? -1 : 1
				if (IS_MAC && e.metaKey) return move(C.lineEdge(ls, s.head, dir))
				if (!e.shiftKey && !collapsed && !word)
					return move(dir < 0 ? C.selFrom(s) : C.selTo(s))
				return move(
					word ? C.wordMove(txt(), s.head, dir) : C.charMove(txt(), s.head, dir, end())
				)
			}
			case 'ArrowUp':
			case 'ArrowDown': {
				const dir = e.key === 'ArrowUp' ? -1 : 1
				if (IS_MAC && e.metaKey) return move(dir < 0 ? 0 : end())
				if (word) return move(C.paragraphMove(txt(), s.head, dir))
				return move(C.lineMove(ls, s.head, dir, goal()), true)
			}
			case 'PageUp':
			case 'PageDown':
				return move(C.pageMove(ls, s.head, e.key === 'PageUp' ? -1 : 1, goal()), true)
			case 'Home':
			case 'End': {
				const dir = e.key === 'Home' ? -1 : 1
				return move(mod ? (dir < 0 ? 0 : end()) : C.lineEdge(ls, s.head, dir))
			}
			case 'Enter':
				if (e.altKey || mod) break
				edit((t, from, to) => {
					deleteRange(t, from, to)
					const c = insertText(t, from, '\n')
					applyNextStyle(doc, t, c)
					return c
				})
				return true
			case 'Backspace':
			case 'Delete':
				del(e.key === 'Backspace' ? -1 : 1, word ? 'word' : 'char')
				return true
			case 'a':
			case 'A':
				if (!mod || e.altKey) break
				select({ story: s.story, anchor: 0, head: end() })
				return true
		}
		return onKey?.(e) ?? false
	}

	const sink = React.useRef<InputSink>({ insert, delete: del, compose, key })
	sink.current = { insert, delete: del, compose, key }
	React.useEffect(() => {
		const a = createInputAdapter(
			{
				insert: (t) => sink.current.insert(t),
				delete: (d, u) => sink.current.delete(d, u),
				compose: (p, t) => sink.current.compose(p, t),
				key: (e) => sink.current.key(e)
			},
			{ label, editable: canInput }
		)
		adapter.current = a
		return () => {
			a.dispose()
			if (adapter.current === a) adapter.current = undefined
		}
	}, [canInput, label])

	const onPointer = (
		type: 'down' | 'move' | 'up' | 'cancel',
		hit: PageHit,
		e: React.PointerEvent
	) => {
		if (type === 'up' || type === 'cancel') {
			drag.current = undefined
			return
		}
		if (type === 'move') {
			const d = drag.current
			const h = d && hitText(index, hit.index, hit.x, hit.y, d.story)
			if (!d || !h) return
			if (d.unit) {
				const [anchor, head] = C.extendByUnit(
					textOf(d.story),
					d.anchor,
					d.head,
					h.offset,
					d.unit
				)
				select({ story: d.story, anchor, head })
			} else select({ story: d.story, anchor: d.anchor, head: h.offset })
			return
		}
		if (e.button !== 0) return
		// Only in or within 8 screen px of a text area / text box; elsewhere deselects.
		const pg = layout.pages.get(keys[hit.index])?.page
		const h = hitText(
			index,
			hit.index,
			hit.x,
			hit.y,
			undefined,
			pg && textAreas(doc, pg),
			(8 / (hit.scale ?? 1)) * FX
		)
		if (!h) {
			clear()
			return
		}
		const c = clicks.current
		const again =
			e.timeStamp - c.t < 500 &&
			Math.abs(e.clientX - c.x) < 4 &&
			Math.abs(e.clientY - c.y) < 4
		Object.assign(c, {
			t: e.timeStamp,
			x: e.clientX,
			y: e.clientY,
			n: again ? (c.n % 3) + 1 : 1
		})
		const s = cur.current.sel
		let next: C.EditorSelection = { story: h.story, anchor: h.offset, head: h.offset }
		if (e.shiftKey && s?.story === h.story) next = { ...s, head: h.offset }
		else if (c.n > 1) {
			const txt = textOf(h.story)
			const [a, b] = c.n === 2 ? C.wordAt(txt, h.offset) : C.paragraphAt(txt, h.offset)
			next = { story: h.story, anchor: a, head: b }
		}
		// A drag after a double/triple click grows by whole words/paragraphs; shift-click by characters.
		drag.current = {
			story: next.story,
			anchor: next.anchor,
			head: next.head,
			unit: !e.shiftKey && c.n > 1 ? (c.n === 2 ? 'word' : 'para') : undefined
		}
		select(next)
		adapter.current?.focus()
	}

	const contextMenu = (hit: PageHit): boolean => {
		const pg = layout.pages.get(keys[hit.index])?.page
		const h = hitText(
			index,
			hit.index,
			hit.x,
			hit.y,
			undefined,
			pg && textAreas(doc, pg),
			(8 / (hit.scale ?? 1)) * FX
		)
		if (!h) return false
		const s = cur.current.sel
		if (!s || s.story !== h.story || h.offset < C.selFrom(s) || h.offset > C.selTo(s))
			select({ story: h.story, anchor: h.offset, head: h.offset })
		adapter.current?.focus()
		return true
	}

	const clear = () => {
		goalX.current = undefined
		cur.current.sel = undefined
		setSel(undefined)
	}

	const collapsed = sel && sel.anchor === sel.head
	const caret = !sel
		? undefined
		: !collapsed
			? undefined
			: (liveEcho ??
				C.caretBox(
					lines(sel.story),
					sel.head + (comp?.story === sel.story ? comp.text.length : 0)
				))
	const rects =
		sel && !collapsed
			? C.selectionRects(lines(sel.story), C.selFrom(sel), C.selTo(sel))
			: undefined

	const overlay = (i: number, size: { w: number; h: number }) => {
		const r = rects?.get(i)
		const c = caret?.page === i ? caret : undefined
		if (!r && !c) return null
		return (
			<Overlay
				w={size.w}
				h={size.h}
				rects={r ?? []}
				caret={c}
				blink={canInput}
				reveal={reveal}
				onCaretRect={(rect) => {
					caretRect.current = rect
					adapter.current?.setCaretRect(rect)
				}}
			/>
		)
	}

	return {
		sel,
		index,
		caretPage: sel && !collapsed ? C.caretBox(lines(sel.story), sel.head)?.page : caret?.page,
		select: (s) => select(s),
		clear,
		run: edit,
		canEdit,
		focus: () => adapter.current?.focus(),
		overlay,
		onPointer,
		contextMenu,
		caretRect: () => caretRect.current
	}
}

// vim: ts=4
