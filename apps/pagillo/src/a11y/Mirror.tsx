// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * Accessibility mirror. The SVG pages are `aria-hidden`; screen readers read this
 * off-screen DOM instead: the whole publication (not virtualized) as headings, paragraphs, lists
 * and figures, built with React from each page's `tags` plus story text — never raw HTML. The
 * caret/selection is mirrored as a DOM Selection, moving the reading cursor inside scrolls the
 * pages, and a polite live region announces page crossings and the notices it is given.
 */

import { useDebouncedValue } from '@cloudillo/react'
import type { PageDL, TableBlock, TagNode } from '@cloudillo/typeset'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import type * as Y from 'yjs'

import { deltaOf, storyTextOf } from '../crdt/delta-cache'
import type { YPagilloDocument } from '../crdt/stored-types'
import { deltaToParagraphs, paragraphStarts } from '../crdt/type-converters'
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
	/** Table paragraph bid → its block (built on first use). */
	tables?: Map<string, TableBlock>
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

/** A table cell: its paragraphs' spans. */
interface MirrorCell {
	th: boolean
	paras: { bid: string; spans: MirrorSpan[] }[]
}

/** A tag node resolved to plain data. */
interface MirrorBlock {
	id: number
	tag: 'p' | 'li' | 'img' | 'table' | 'aside' | (typeof HEADINGS)[keyof typeof HEADINGS]
	/** Rows of a `table` with a line on this page. */
	rows?: MirrorCell[][]
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
	const spanEls = (bid: string | undefined, spans: MirrorSpan[]) =>
		spans.map((s) => (
			<span key={s.from} data-story={s.story} data-bid={bid} data-from={s.from}>
				{s.text}
			</span>
		))
	const el = (b: MirrorBlock) => {
		if (b.tag === 'img') return <div key={b.id} role="img" aria-label={b.alt} />
		if (b.tag === 'table')
			return (
				<table key={b.id}>
					<tbody>
						{b.rows?.map((r, ri) => (
							<tr key={ri}>
								{r.map((c, ci) => {
									const cell = c.paras.map((p) => (
										<p key={p.bid}>{spanEls(p.bid, p.spans)}</p>
									))
									return c.th ? (
										<th key={ci} scope="col">
											{cell}
										</th>
									) : (
										<td key={ci}>{cell}</td>
									)
								})}
							</tr>
						))}
					</tbody>
				</table>
			)
		const Tag = b.tag
		return (
			<Tag key={b.id} role={b.tag === 'aside' ? 'note' : undefined}>
				{spanEls(b.bid, b.spans)}
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
			const onPage = new Set(placed.map((pl) => pl.line.bid))
			const tableRows = (bid: string): MirrorCell[][] => {
				for (const sid of new Set(placed.map((pl) => pl.line.story))) {
					const s = story(sid)
					if (!s.tables) {
						const tx = doc.tx.get(sid)
						s.tables = new Map()
						for (const p of tx ? deltaToParagraphs(deltaOf(tx)) : []) {
							if (!Array.isArray(p.runs) && p.runs.k === 'table')
								s.tables.set(p.bid, p.runs)
						}
					}
					const tb = s.tables.get(bid)
					if (!tb) continue
					// Rows never split: a row is on this page when one of its lines is.
					return tb.rows
						.filter((r) =>
							r.cells.some((c) => c.paragraphs.some((p) => onPage.has(p.bid)))
						)
						.map((r) =>
							r.cells.map((c) => ({
								th: !!r.header,
								paras: c.paragraphs.map((p) => ({
									bid: p.bid,
									spans: spans(p.bid)
								}))
							}))
						)
				}
				return []
			}
			const blocks: MirrorBlock[] = []
			const walk = (nodes: TagNode[]) => {
				for (const n of nodes) {
					if (n.role === 'Artifact') continue
					if (n.role === 'Document') walk(n.children ?? [])
					else if (n.role === 'Figure') {
						if (n.alt) blocks.push({ id: n.id, tag: 'img', alt: n.alt, spans: [] })
					} else if (n.role === 'Table') {
						// Its TR / TH / TD children are rebuilt from the story (cells carry no bid).
						const rows = n.bid ? tableRows(n.bid) : []
						if (rows.length) blocks.push({ id: n.id, tag: 'table', rows, spans: [] })
					} else if (n.role === 'Note') {
						// Footnote body (no bid): its P children's text, one `aside role=note`.
						const ps = (n.children ?? []).flatMap((c) => (c.bid ? spans(c.bid) : []))
						if (ps.length) blocks.push({ id: n.id, tag: 'aside', spans: ps })
					} else {
						const list = n.role === 'P' && n.bid ? listOf(n.bid) : undefined
						blocks.push({
							id: n.id,
							tag:
								n.role === 'P'
									? list
										? 'li'
										: 'p'
									: ((HEADINGS as Record<string, MirrorBlock['tag']>)[n.role] ??
										'p'),
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
