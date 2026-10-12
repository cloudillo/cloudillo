// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Accessibility mirror. The SVG pages are `aria-hidden`; screen readers read this
 * off-screen DOM instead: the whole publication (not virtualized) as headings, paragraphs, lists
 * and figures, built with React from each page's `tags` plus story text — never raw HTML. The
 * caret/selection is mirrored as a DOM Selection, moving the reading cursor inside scrolls the
 * pages, and a polite live region announces page crossings and the notices it is given.
 */

import { useDebouncedValue } from '@cloudillo/react'
import type { PageDL, TagNode } from '@cloudillo/typeset'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import type * as Y from 'yjs'

import { deltaOf, storyTextOf } from '../crdt/delta-cache'
import type { YPagilloDocument } from '../crdt/stored-types'
import { paragraphStarts } from '../crdt/type-converters'
import * as C from '../editor/caret'
import type { Editor } from '../editor/useEditor'
import type { LayoutState } from '../layout/useLayout'
import { flattenPages, scrollToPage } from '../view/PageList'

export const MIRROR_ID = 'pagillo-a11y-mirror'
const MIRROR_DEBOUNCE_MS = 400

const OFFSCREEN: React.CSSProperties = {
	position: 'fixed',
	left: -10000,
	top: 0,
	width: 1,
	height: 1,
	overflow: 'hidden'
}

const HEADINGS = { H1: 'h1', H2: 'h2', H3: 'h3', H4: 'h4', H5: 'h5', H6: 'h6' } as const

interface StoryInfo {
	txt: string
	/** bid → list kind of that paragraph (its '\n' attrs). */
	lists: Map<string, string>
}

function storyInfo(t: Y.Text): StoryInfo {
	const lists = new Map<string, string>()
	for (const op of deltaOf(t)) {
		const a = op.attributes
		if (
			typeof op.insert === 'string' &&
			a &&
			typeof a.bid === 'string' &&
			typeof a.list === 'string'
		)
			lists.set(a.bid, a.list)
	}
	return { txt: storyTextOf(t), lists }
}

/** One line's text; `from` is its offset within paragraph `bid` (stable across edits elsewhere). */
interface MirrorSpan {
	story: string
	from: number
	text: string
}

/** A tag node resolved to plain data. */
interface MirrorBlock {
	id: number
	tag: 'p' | 'li' | 'img' | (typeof HEADINGS)[keyof typeof HEADINGS]
	/** List kind (`li` only). */
	list?: string
	alt?: string
	bid?: string
	spans: MirrorSpan[]
}

interface MirrorPageProps {
	pageKey: string
	/** "Page n" heading. */
	label: string
	/** Compared by identity only. */
	dl?: PageDL
	blocks: MirrorBlock[]
	/** `JSON.stringify(blocks)`: re-render only when the resolved content changed. */
	sig: string
}

function MirrorPageView({ pageKey, label, blocks }: MirrorPageProps) {
	const out: React.ReactNode[] = []
	const el = (b: MirrorBlock) => {
		if (b.tag === 'img') return <div key={b.id} role="img" aria-label={b.alt} />
		const Tag = b.tag
		return (
			<Tag key={b.id}>
				{b.spans.map((s) => (
					<span key={s.from} data-story={s.story} data-bid={b.bid} data-from={s.from}>
						{s.text}
					</span>
				))}
			</Tag>
		)
	}
	// Lists are flat (no nesting by `indent`); a list split across pages is two lists.
	for (let j = 0; j < blocks.length; ) {
		const kind = blocks[j].list
		if (!kind) {
			out.push(el(blocks[j++]))
			continue
		}
		const items: React.ReactNode[] = []
		while (j < blocks.length && blocks[j].list === kind) items.push(el(blocks[j++]))
		out.push(
			kind === 'ordered' ? <ol key={`l${j}`}>{items}</ol> : <ul key={`l${j}`}>{items}</ul>
		)
	}
	return (
		<div data-page={pageKey}>
			<p>{label}</p>
			{out}
		</div>
	)
}

const MirrorPage = React.memo(
	MirrorPageView,
	(a, b) => a.dl === b.dl && a.sig === b.sig && a.label === b.label && a.pageKey === b.pageKey
)

export interface MirrorProps {
	doc: YPagilloDocument
	editor: Editor
	layout: LayoutState
	/** Banner / status texts; each new one is announced once. */
	notices: string[]
}

export function Mirror({ doc, editor, layout, notices }: MirrorProps) {
	const { t } = useTranslation()
	const root = React.useRef<HTMLDivElement>(null)
	const [said, setSaid] = React.useState('')
	const { index } = editor
	const pages = React.useMemo(() => flattenPages(layout.sections), [layout.sections])
	// The screen-reader mirror catches up once typing pauses (O(document) rebuild).
	const live = React.useMemo(() => ({ index, pages: layout.pages }), [index, layout.pages])
	const { index: mIndex, pages: mPages } = useDebouncedValue(live, MIRROR_DEBOUNCE_MS)

	const content = React.useMemo(() => {
		const stories = new Map<string, StoryInfo>()
		const story = (id: string) => {
			let s = stories.get(id)
			if (!s) {
				const tx = doc.tx.get(id)
				s = tx ? storyInfo(tx) : { txt: '', lists: new Map() }
				stories.set(id, s)
			}
			return s
		}
		return pages.map((ref, i) => {
			const dl = mPages.get(ref.key)
			const placed = mIndex.pages.get(i) ?? []
			const spans = (bid: string): MirrorSpan[] =>
				placed
					.filter((pl) => pl.line.bid === bid)
					.map((pl) => ({
						story: pl.line.story,
						from: pl.line.from,
						text: story(pl.line.story).txt.slice(pl.from, pl.to).replace(/[\n￼]/g, ' ')
					}))
			const listOf = (bid: string) => {
				const pl = placed.find((x) => x.line.bid === bid)
				return pl && story(pl.line.story).lists.get(bid)
			}
			const blocks: MirrorBlock[] = []
			const walk = (nodes: TagNode[]) => {
				for (const n of nodes) {
					if (n.role === 'Artifact') continue
					if (n.role === 'Document') walk(n.children ?? [])
					else if (n.role === 'Figure') {
						if (n.alt) blocks.push({ id: n.id, tag: 'img', alt: n.alt, spans: [] })
					} else {
						const list = n.role === 'P' && n.bid ? listOf(n.bid) : undefined
						blocks.push({
							id: n.id,
							tag: n.role === 'P' ? (list ? 'li' : 'p') : HEADINGS[n.role],
							list,
							bid: n.bid,
							spans: n.bid ? spans(n.bid) : []
						})
					}
				}
			}
			walk(dl?.tags ?? [])
			return (
				<MirrorPage
					key={ref.key}
					pageKey={ref.key}
					label={t('Page {{n}}', { n: i + 1 })}
					dl={dl}
					blocks={blocks}
					sig={JSON.stringify(blocks)}
				/>
			)
		})
	}, [doc, mIndex, mPages, pages, t])

	// DOM Selection mirror — only while focus is in the mirror or nowhere: moving the document
	// selection away from the focused input adapter would break typing.
	const ours = React.useRef(false)
	const sel = editor.sel
	React.useEffect(() => {
		const el = root.current
		const a = document.activeElement
		if (!el || !sel || (a && a !== document.body && !el.contains(a))) return
		const tx = doc.tx.get(sel.story)
		if (!tx) return
		// Spans carry paragraph-relative offsets; map them back to the story.
		const starts = paragraphStarts(deltaOf(tx))
		const at = (off: number): [Node, number] | undefined => {
			for (const s of el.querySelectorAll<HTMLElement>(
				`span[data-story="${CSS.escape(sel.story)}"]`
			)) {
				const from = (starts.get(s.dataset.bid ?? '') ?? 0) + Number(s.dataset.from)
				const node = s.firstChild
				if (node && off >= from && off <= from + (node.textContent?.length ?? 0))
					return [node, off - from]
			}
		}
		const x = at(sel.anchor)
		const y = at(sel.head)
		if (!x || !y) return
		ours.current = true
		document.getSelection()?.setBaseAndExtent(x[0], x[1], y[0], y[1])
	}, [sel, content, doc])

	// Reading cursor moved inside the mirror → scroll the pages to it.
	React.useEffect(() => {
		let last = ''
		const onSel = () => {
			if (ours.current) {
				ours.current = false
				return
			}
			const n = document.getSelection()?.focusNode
			const el = root.current
			if (!n || !el?.contains(n)) return
			const key = (n instanceof Element ? n : n.parentElement)
				?.closest('[data-page]')
				?.getAttribute('data-page')
			if (key && key !== last) {
				last = key
				scrollToPage(key)
			}
		}
		document.addEventListener('selectionchange', onSel)
		return () => document.removeEventListener('selectionchange', onSel)
	}, [])

	// Live region: caret page crossings, new notices.
	const caretPage = sel
		? C.caretBox(index.stories.get(sel.story) ?? [], sel.head)?.page
		: undefined
	const prevPage = React.useRef(caretPage)
	React.useEffect(() => {
		if (
			caretPage !== undefined &&
			prevPage.current !== undefined &&
			caretPage !== prevPage.current
		)
			setSaid(t('Page {{n}}', { n: caretPage + 1 }))
		prevPage.current = caretPage
	}, [caretPage, t])
	const prevNotices = React.useRef<string[]>([])
	const noticeKey = notices.join('\n')
	React.useEffect(() => {
		const fresh = notices.filter((n) => !prevNotices.current.includes(n))
		prevNotices.current = notices
		if (fresh.length) setSaid(fresh.join('. '))
	}, [noticeKey])

	return (
		<>
			<div
				ref={root}
				id={MIRROR_ID}
				role="document"
				aria-label={t('Document text')}
				tabIndex={-1}
				style={OFFSCREEN}
			>
				{content}
			</div>
			<div role="status" aria-live="polite" style={OFFSCREEN}>
				{said}
			</div>
		</>
	)
}

// vim: ts=4
