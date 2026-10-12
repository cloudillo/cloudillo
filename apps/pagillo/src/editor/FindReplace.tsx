// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Find & replace. Ctrl/Cmd+F is intercepted for everyone (window capture listener, so it
 * works for readers and with nothing focused); readers get find only. The search runs on the
 * main thread over the whole publication: section stories in `secs` order,
 * then text-frame stories; a hit's page comes from `editor.index`. Hits are highlighted from
 * `LineGeom` (`selectionRects`); the current one is also the editor selection.
 */

import { FX } from '@cloudillo/typeset'
import { Button, Input } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuChevronDown, LuChevronUp, LuX } from 'react-icons/lu'
import * as Y from 'yjs'

import type { StoredTextFrameData, YPagilloDocument } from '../crdt/stored-types'
import type { LayoutState } from '../layout/useLayout'
import { flattenPages, scrollToPage } from '../view/PageList'
import * as C from './caret'
import { deleteRange, insertText } from './text-edit'
import type { Editor } from './useEditor'

export interface Hit {
	story: string
	/** Y.Text offsets. */
	from: number
	to: number
}

/** Searchable stories in reading order (orphans of undone section breaks are skipped). */
function searchStories(doc: YPagilloDocument): string[] {
	const out = new Set<string>()
	for (const id of doc.secs.toArray()) {
		const s = doc.s.get(id)?.story
		if (s) out.add(s)
	}
	for (const f of doc.f.values())
		if (f.t === 'txt') out.add((f.data as StoredTextFrameData).story)
	return [...out]
}

/** Every match of `q` (literal) in the publication. */
export function findHits(doc: YPagilloDocument, q: string, matchCase: boolean): Hit[] {
	if (!q) return []
	const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), matchCase ? 'g' : 'gi')
	const out: Hit[] = []
	for (const story of searchStories(doc)) {
		const t = doc.tx.get(story)
		if (!t) continue
		for (const m of C.storyText(t).matchAll(re)) {
			out.push({ story, from: m.index, to: m.index + m[0].length })
		}
	}
	return out
}

export interface FindReplace {
	open(): void
	/** Hit highlights of global page `i`; compose under `editor.overlay`. */
	overlay(i: number, size: { w: number; h: number }): React.ReactNode
	/** The Find bar (null while closed). */
	bar: React.ReactNode
}

const pt = (fx: number) => fx / FX

export function useFindReplace({
	yDoc,
	doc,
	editor,
	layout,
	canEdit
}: {
	yDoc: Y.Doc
	doc: YPagilloDocument
	editor: Editor
	layout: LayoutState
	canEdit: boolean
}): FindReplace {
	const { t } = useTranslation()
	const [shown, setShown] = React.useState(false)
	const [q, setQ] = React.useState('')
	const [repl, setRepl] = React.useState('')
	const [matchCase, setMatchCase] = React.useState(false)
	const [cur, setCur] = React.useState(0)
	const [ver, setVer] = React.useState(0)
	const [focusTick, setFocusTick] = React.useState(0)
	const input = React.useRef<HTMLInputElement>(null)
	const latest = React.useRef({ editor, doc })
	latest.current = { editor, doc }

	const open = React.useCallback(() => {
		// Prefill with a single-line selection.
		const { editor: ed, doc: d } = latest.current
		const s = ed.sel
		const tx = s && s.anchor !== s.head ? d.tx.get(s.story) : undefined
		const txt = tx && s ? C.storyText(tx).slice(C.selFrom(s), C.selTo(s)) : ''
		if (txt && !txt.includes('\n') && !txt.includes('￼')) setQ(txt)
		setShown(true)
		setFocusTick((n) => n + 1)
	}, [])

	React.useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (
				(e.ctrlKey || e.metaKey) &&
				!e.altKey &&
				!e.shiftKey &&
				e.key.toLowerCase() === 'f'
			) {
				e.preventDefault()
				e.stopPropagation()
				open()
			}
		}
		window.addEventListener('keydown', onKey, true)
		return () => window.removeEventListener('keydown', onKey, true)
	}, [open])

	React.useEffect(() => {
		if (!focusTick) return
		input.current?.focus()
		input.current?.select()
	}, [focusTick])

	// Re-search on text and section changes while open.
	React.useEffect(() => {
		if (!shown) return
		const bump = () => setVer((v) => v + 1)
		doc.tx.observeDeep(bump)
		doc.secs.observe(bump)
		doc.f.observe(bump)
		return () => {
			doc.tx.unobserveDeep(bump)
			doc.secs.unobserve(bump)
			doc.f.unobserve(bump)
		}
	}, [shown, doc])

	const hits = React.useMemo(
		() => (shown ? findHits(doc, q, matchCase) : []),
		[shown, doc, q, matchCase, ver]
	)
	const at = hits.length ? Math.min(cur, hits.length - 1) : 0

	const index = editor.index
	// Highlight rects per page: O(hits × story lines); bucket lines by offset if many hits lag.
	const rects = React.useMemo(() => {
		const out = new Map<number, { r: C.Rect; on: boolean }[]>()
		hits.forEach((h, k) => {
			const lines = index.stories.get(h.story) ?? []
			for (const [page, rs] of C.selectionRects(lines, h.from, h.to)) {
				let list = out.get(page)
				if (!list) {
					list = []
					out.set(page, list)
				}
				for (const r of rs) list.push({ r, on: k === at })
			}
		})
		return out
	}, [hits, index, at])

	const isSelected = (h: Hit | undefined) => {
		const s = editor.sel
		return !!h && !!s && s.story === h.story && C.selFrom(s) === h.from && C.selTo(s) === h.to
	}

	const go = (k: number) => {
		if (!hits.length) return
		const n = (k + hits.length) % hits.length
		const h = hits[n]
		setCur(n)
		editor.select({ story: h.story, anchor: h.from, head: h.to })
		const page = C.lineAt(index.stories.get(h.story) ?? [], h.from)?.page
		const key = page !== undefined ? flattenPages(layout.sections)[page]?.key : undefined
		if (key) scrollToPage(key)
	}
	const next = () => go(isSelected(hits[at]) ? at + 1 : at)
	const prev = () => go(at - 1)

	/** Replace the current hit (select it first if it is not the selection), then select the next. */
	const replace = () => {
		const h = hits[at]
		if (!isSelected(h)) return go(at)
		if (
			!editor.run((tx, from, to) => {
				deleteRange(tx, from, to)
				return insertText(tx, from, repl)
			})
		)
			return
		// The replaced hit drops out of the list, so `at` will point at the next one.
		const n = hits[at + 1]
		if (n) {
			const d = n.story === h.story ? repl.length - (h.to - h.from) : 0
			editor.select({ story: n.story, anchor: n.from + d, head: n.to + d })
		}
	}

	/** Every hit in one transaction (one undo step); last to first so offsets stay valid. */
	const replaceAll = () => {
		if (!hits.length || !editor.canEdit(hits[0].story)) return
		// Our own origin skips the editor's remap observer (and keeps the undo step), so carry
		// the selection across the edit as relative positions.
		const s = editor.sel
		const st = s && doc.tx.get(s.story)
		const rel = st && [
			Y.createRelativePositionFromTypeIndex(st, s.anchor),
			Y.createRelativePositionFromTypeIndex(st, s.head)
		]
		yDoc.transact(() => {
			for (const h of [...hits].reverse()) {
				const tx = doc.tx.get(h.story)
				if (!tx) continue
				deleteRange(tx, h.from, h.to)
				insertText(tx, h.from, repl)
			}
		}, yDoc.clientID)
		if (!s || !st || !rel) return
		const abs = (r: Y.RelativePosition, o: number) =>
			Y.createAbsolutePositionFromRelativePosition(r, yDoc)?.index ?? Math.min(o, st.length)
		editor.select({ story: s.story, anchor: abs(rel[0], s.anchor), head: abs(rel[1], s.head) })
	}

	const close = () => {
		setShown(false)
		editor.focus()
	}

	const onFindKey = (e: React.KeyboardEvent) => {
		if (e.key === 'Enter') {
			e.preventDefault()
			if (e.shiftKey) prev()
			else next()
		} else if (e.key === 'Escape') {
			e.preventDefault()
			close()
		}
	}

	const overlay = (i: number, size: { w: number; h: number }) => {
		const rs = rects.get(i)
		if (!rs) return null
		return (
			<svg
				className="pagillo-find-hits"
				viewBox={`0 0 ${pt(size.w)} ${pt(size.h)}`}
				preserveAspectRatio="none"
				aria-hidden="true"
				style={{
					position: 'absolute',
					inset: 0,
					width: '100%',
					height: '100%',
					pointerEvents: 'none'
				}}
			>
				{rs.map(({ r, on }) => (
					<rect
						key={`${r.x}:${r.y}`}
						x={pt(r.x)}
						y={pt(r.y)}
						width={pt(r.w)}
						height={pt(r.h)}
						fill={on ? '#ff9500' : '#ffd400'}
						fillOpacity={0.45}
					/>
				))}
			</svg>
		)
	}

	const status = !q
		? ''
		: hits.length
			? t('{{n}} of {{m}}', { n: at + 1, m: hits.length })
			: t('No results')

	const bar = shown ? (
		<div className="c-hbox g-1 p-1 pagillo-find" role="search" style={{ alignItems: 'center' }}>
			<Input
				ref={input}
				value={q}
				placeholder={t('Find')}
				aria-label={t('Find')}
				onChange={(e) => {
					setQ(e.target.value)
					setCur(0)
				}}
				onKeyDown={onFindKey}
			/>
			<Button
				variant="ghost"
				size="sm"
				aria-pressed={matchCase}
				title={t('Match case')}
				onClick={() => setMatchCase((v) => !v)}
			>
				Aa
			</Button>
			<span aria-live="polite" style={{ minWidth: '5em' }}>
				{status}
			</span>
			<Button
				variant="ghost"
				size="sm"
				icon={<LuChevronUp />}
				aria-label={t('Previous match')}
				disabled={!hits.length}
				onClick={prev}
			/>
			<Button
				variant="ghost"
				size="sm"
				icon={<LuChevronDown />}
				aria-label={t('Next match')}
				disabled={!hits.length}
				onClick={next}
			/>
			{canEdit && (
				<>
					<Input
						value={repl}
						placeholder={t('Replace with')}
						aria-label={t('Replace with')}
						onChange={(e) => setRepl(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === 'Enter') {
								e.preventDefault()
								replace()
							} else if (e.key === 'Escape') {
								e.preventDefault()
								close()
							}
						}}
					/>
					<Button variant="ghost" size="sm" disabled={!hits.length} onClick={replace}>
						{t('Replace')}
					</Button>
					<Button variant="ghost" size="sm" disabled={!hits.length} onClick={replaceAll}>
						{t('Replace all')}
					</Button>
				</>
			)}
			<Button
				variant="ghost"
				size="sm"
				icon={<LuX />}
				aria-label={t('Close')}
				onClick={close}
			/>
		</div>
	) : null

	return { open, overlay, bar }
}

// vim: ts=4
