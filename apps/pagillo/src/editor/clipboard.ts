// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * Clipboard. Copy (also for readers) writes `text/plain`, `text/html` and our Delta
 * (`application/x-cloudillo-delta`); paste prefers our Delta, then HTML (quillo writes no Delta
 * MIME — its HTML carries the block structure), then plain text. Pasted HTML goes through a
 * `DOMParser` (inert document: no scripts, no loads) and an allowlist walk straight to Delta;
 * it never reaches the live DOM. Every pasted paragraph gets a fresh `bid`.
 */

import { type DocLinkResult, getAppBus, safeHref } from '@cloudillo/core'
import { FX } from '@cloudillo/typeset'
import { useToast } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import * as Y from 'yjs'

import { newBlockId, stripBlockIds } from '../crdt/block-ids'
import { deltaOf } from '../crdt/delta-cache'
import { flowStories, frameOf, newFrameMap, readFrame, styleOf } from '../crdt/entities'
import { newId } from '../crdt/ids'
import { sanitizeOverrides } from '../crdt/overrides'
import { copyStory } from '../crdt/story-ops'
import {
	LINE_KEYS,
	MARK_KEYS,
	type StoredFrame,
	type StoredImageData,
	type StoredTextFrameData,
	type StyleMapKey,
	TABLE_KEYS,
	type YPagilloDocument
} from '../crdt/stored-types'
import {
	BORDERS,
	cellOf,
	cellSpan,
	colSpanOf,
	type DeltaOp,
	markerWins,
	newCellId,
	newRowId,
	readMeta,
	rowOf
} from '../crdt/type-converters'
import { clamp } from './frames'
import { embedTarget } from '../embeds/record'
import * as C from './caret'
import type { CommandCtx } from './commands'
import { breakBefore, deleteRange, insertText, paragraphEnd } from './text-edit'

export const DELTA_MIME = 'application/x-cloudillo-delta'

/** Character marks with their value type (clipboard data is untrusted: a page can write our MIME). */
const MARK_TYPES = {
	bold: 'boolean',
	italic: 'boolean',
	underline: 'boolean',
	strike: 'boolean',
	color: 'string',
	font: 'string',
	size: 'number',
	link: 'string',
	cs: 'string'
} satisfies Record<(typeof MARK_KEYS)[number], string>
const NO_MARKS = Object.fromEntries(MARK_KEYS.map((k) => [k, null]))
const NO_LINE = Object.fromEntries(LINE_KEYS.map((k) => [k, null]))

const isObj = (v: unknown): v is Record<string, unknown> =>
	!!v && typeof v === 'object' && !Array.isArray(v)
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** A well-formed `InlineEmbed` (typeset model.ts). */
function validEmbed(e: unknown): boolean {
	if (!isObj(e) || Object.keys(e).length !== 1) return false
	// `emb` is not pasteable until its record shape is validated here.
	const { img, fn, field, toc, frame } = e
	if (frame !== undefined) return typeof frame === 'string'
	if (img !== undefined)
		return (
			isObj(img) &&
			typeof img.fileId === 'string' &&
			isNum(img.w) &&
			isNum(img.h) &&
			typeof img.alt === 'string'
		)
	if (fn !== undefined) return typeof fn === 'string'
	if (field !== undefined) return typeof field === 'string'
	if (toc !== undefined) return isObj(toc) && isNum(toc.levels)
	return false
}

const styleMap = (doc: YPagilloDocument) => readMeta(doc.m).styleMap

/** Links we keep: `safeHref` (web, mail, relative) plus Cloudillo `cl:` refs. */
const safeLink = (v: unknown) =>
	safeHref(v) ??
	// biome-ignore lint/suspicious/noControlCharactersInRegex: rejecting control characters
	(typeof v === 'string' && /^cl:[^\0-\x1f\x7f]*$/i.test(v.trim()) ? v.trim() : undefined)

/** Ops of `[from, to)` (Y.Text offsets). */
export function sliceDelta(ops: DeltaOp[], from: number, to: number): DeltaOp[] {
	const out: DeltaOp[] = []
	let pos = 0
	for (const op of ops) {
		const len = typeof op.insert === 'string' ? op.insert.length : 1
		const a = Math.max(from, pos)
		const b = Math.min(to, pos + len)
		if (a < b) {
			const insert =
				typeof op.insert === 'string' ? op.insert.slice(a - pos, b - pos) : op.insert
			out.push(op.attributes ? { insert, attributes: op.attributes } : { insert })
		}
		pos += len
	}
	return out
}

/** Plain text of a fragment (embeds dropped). */
export function deltaToPlain(ops: DeltaOp[]): string {
	return ops.map((op) => (typeof op.insert === 'string' ? op.insert : '')).join('')
}

const BLOCK_TAG: Partial<Record<StyleMapKey, string>> = {
	h1: 'h1',
	h2: 'h2',
	h3: 'h3',
	h4: 'h4',
	h5: 'h5',
	h6: 'h6',
	quote: 'blockquote',
	code: 'pre'
}

/** HTML of a fragment, built with DOM APIs and serialised (paragraph styles via `m.styleMap`). */
export function deltaToHtml(doc: YPagilloDocument, ops: DeltaOp[]): string {
	const keyOf = new Map(Object.entries(styleMap(doc)).map(([k, id]) => [id, k as StyleMapKey]))
	const root = document.createElement('div')
	let inline: Node[] = []
	let list: HTMLElement | undefined
	let table:
		| { el: HTMLElement; tr?: HTMLElement; row?: string; td?: HTMLElement; cell?: string }
		| undefined
	const endLine = (a: Record<string, unknown>) => {
		const cell = cellOf(a)
		let parent: HTMLElement = root
		if (cell === undefined) table = undefined
		else if (!cell) {
			// The table's own line starts a new table; `table-col` lines carry nothing.
			if (a['table-temporary'] != null) table = undefined
			inline = []
			return
		} else {
			if (!table) {
				table = { el: document.createElement('table') }
				root.append(table.el)
			}
			const row = rowOf(a) ?? ''
			if (!table.tr || table.row !== row) {
				table.tr = document.createElement('tr')
				table.el.append(table.tr)
				table.row = row
				table.td = undefined
			}
			if (!table.td || table.cell !== cell) {
				const td = document.createElement(a['table-th'] != null ? 'th' : 'td')
				td.colSpan = colSpanOf(a)
				table.td = td
				table.tr.append(table.td)
				table.cell = cell
			}
			parent = table.td
		}
		const kind = a.list === 'ordered' ? 'ol' : a.list === 'bullet' ? 'ul' : undefined
		let block: HTMLElement
		if (kind) {
			if (list?.tagName.toLowerCase() !== kind || list.parentElement !== parent) {
				list = document.createElement(kind)
				parent.append(list)
			}
			block = document.createElement('li')
			list.append(block)
		} else {
			list = undefined
			block = document.createElement(BLOCK_TAG[keyOf.get(a.ps as string) ?? 'p'] ?? 'p')
			parent.append(block)
		}
		block.append(...(inline.length ? inline : [document.createElement('br')]))
		inline = []
	}
	for (const op of ops) {
		if (typeof op.insert !== 'string') continue
		const a = op.attributes ?? {}
		op.insert.split('\n').forEach((part, i) => {
			if (i) endLine(a)
			if (!part) return
			let node: Node = document.createTextNode(part)
			const wrap = (tag: string) => {
				const el = document.createElement(tag)
				el.append(node)
				node = el
				return el
			}
			if (a.bold) wrap('strong')
			if (a.italic) wrap('em')
			if (a.underline) wrap('u')
			if (a.strike) wrap('s')
			if (typeof a.color === 'string') wrap('span').style.color = a.color
			const href = safeLink(a.link)
			if (href) wrap('a').setAttribute('href', href)
			inline.push(node)
		})
	}
	root.append(...inline)
	return root.innerHTML
}

const SKIP = new Set([
	'SCRIPT',
	'STYLE',
	'HEAD',
	'TITLE',
	'META',
	'LINK',
	'TEMPLATE',
	'NOSCRIPT',
	'IFRAME',
	'OBJECT',
	'EMBED',
	'SVG',
	'MATH',
	'IMG',
	'VIDEO',
	'AUDIO',
	'CANVAS'
])
const BLOCK_KEY: Record<string, StyleMapKey> = {
	P: 'p',
	DIV: 'p',
	LI: 'p',
	/** Only a table nested in a cell: its cells become paragraphs of that cell. */
	TD: 'p',
	TH: 'p',
	DT: 'p',
	DD: 'p',
	H1: 'h1',
	H2: 'h2',
	H3: 'h3',
	H4: 'h4',
	H5: 'h5',
	H6: 'h6',
	BLOCKQUOTE: 'quote',
	PRE: 'code',
	FIGCAPTION: 'caption',
	CAPTION: 'caption'
}

interface Block {
	key: StyleMapKey
	list?: 'bullet' | 'ordered'
	indent?: number
	/** Inside a top-level `<tr>`: its row id. */
	row?: string
	/** Inside a top-level `<td>` / `<th>`: every line is a line of this cell. */
	cell?: { row: string; id: string; th: boolean; colspan?: string; rowspan?: string }
}

/** A `colspan` / `rowspan` worth keeping (2–64), as stored. */
const span = (v: unknown) => {
	const n = cellSpan(v)
	return n === undefined ? undefined : String(n)
}

/**
 * Sanitized HTML → story Delta. Keeps paragraph structure (headings/quote/code via `m.styleMap`,
 * lists with nesting), bold/italic/underline/strike, safe links and colours; tables become
 * quill-table-better cell lines (fresh row / cell ids; a table nested in a cell flattens into
 * that cell's paragraphs). Fonts, sizes and images are dropped; map them when the pasted look
 * must survive (fonts must be bundled).
 */
export function htmlToDelta(doc: YPagilloDocument, html: string): DeltaOp[] {
	const map = styleMap(doc)
	const parsed = new DOMParser().parseFromString(html, 'text/html')
	const ops: DeltaOp[] = []
	let open = false
	/** A `<table>` opened: its first cell writes the `table-temporary` line first. */
	let tableStart = false
	const endLine = (b: Block) => {
		const attrs: Record<string, unknown> = {}
		if (map[b.key]) attrs.ps = map[b.key]
		if (b.list) attrs.list = b.list
		if (b.indent) attrs.indent = b.indent
		const c = b.cell
		if (c) {
			const ca: Record<string, unknown> = { 'data-row': c.row }
			if (c.colspan) ca.colspan = c.colspan
			if (c.rowspan) ca.rowspan = c.rowspan
			attrs[c.th ? 'table-th' : 'table-cell'] = ca
			attrs[c.th ? 'table-th-block' : 'table-cell-block'] = c.id
		}
		ops.push({ insert: '\n', attributes: attrs })
		open = false
	}
	const text = (s: string, marks: Record<string, unknown>) => {
		if (!s) return
		open = true
		ops.push(Object.keys(marks).length ? { insert: s, attributes: marks } : { insert: s })
	}
	const walk = (node: Node, marks: Record<string, unknown>, block: Block, pre: boolean) => {
		if (node.nodeType === Node.TEXT_NODE) {
			const data = node.textContent ?? ''
			if (pre) {
				data.replaceAll('\r', '')
					.split('\n')
					.forEach((s, i) => {
						if (i) endLine(block)
						text(s, marks)
					})
				return
			}
			const s = data.replace(/\s+/g, ' ')
			return void text(open ? s : s.trimStart(), marks)
		}
		if (node.nodeType !== Node.ELEMENT_NODE) return
		const el = node as HTMLElement
		const tag = el.tagName.toUpperCase()
		if (SKIP.has(tag)) return
		if (tag === 'BR') return void endLine(block)

		const m = { ...marks }
		if (tag === 'B' || tag === 'STRONG') m.bold = true
		if (tag === 'I' || tag === 'EM') m.italic = true
		if (tag === 'U' || tag === 'INS') m.underline = true
		if (tag === 'S' || tag === 'STRIKE' || tag === 'DEL') m.strike = true
		if (tag === 'A') {
			const href = safeLink(el.getAttribute('href'))
			if (href) m.link = href
		}
		const st = el.style
		if (st) {
			const w = st.fontWeight
			if (w === 'bold' || Number(w) >= 600) m.bold = true
			else if (w === 'normal' || (w && Number(w) < 600)) delete m.bold
			if (st.fontStyle === 'italic') m.italic = true
			if (
				st.textDecorationLine?.includes('underline') ||
				st.textDecoration?.includes('underline')
			)
				m.underline = true
			if (
				st.textDecorationLine?.includes('line-through') ||
				st.textDecoration?.includes('line-through')
			)
				m.strike = true
			if (st.color && st.color !== 'inherit' && st.color !== 'initial') m.color = st.color
		}

		let key: StyleMapKey | undefined = BLOCK_KEY[tag]
		let inner = block
		let n = -1
		const top = !block.cell
		if (top && tag === 'TABLE') {
			if (open) endLine(block)
			tableStart = true
		} else if (top && tag === 'TR') {
			if (open) endLine(block)
			inner = { key: 'p', row: newRowId() }
		} else if (top && (tag === 'TD' || tag === 'TH')) {
			if (open) endLine(block)
			if (tableStart) ops.push({ insert: '\n', attributes: { 'table-temporary': {} } })
			tableStart = false
			n = ops.length
			key = undefined
			inner = {
				key: 'p',
				cell: {
					row: block.row ?? newRowId(),
					id: newCellId(),
					th: tag === 'TH',
					colspan: span(el.getAttribute('colspan')),
					rowspan: span(el.getAttribute('rowspan'))
				}
			}
		} else if (key) {
			if (open) endLine(block)
			inner = { key, cell: block.cell }
			if (tag === 'LI') {
				// Quill 2 exports every list as <ol> with `data-list`; indent = nesting or ql-indent-N.
				const ql = el.getAttribute('data-list')
				const parent = el.parentElement?.tagName.toUpperCase()
				inner.list = ql
					? ql === 'ordered'
						? 'ordered'
						: 'bullet'
					: parent === 'OL'
						? 'ordered'
						: 'bullet'
				let depth = 0
				for (let p = el.parentElement?.parentElement; p; p = p.parentElement) {
					if (p.tagName === 'UL' || p.tagName === 'OL') depth++
				}
				const qi = /ql-indent-(\d+)/.exec(el.className)
				inner.indent = qi ? Number(qi[1]) : depth
			}
		}
		const isPre = pre || tag === 'PRE'
		for (const child of el.childNodes) walk(child, m, inner, isPre)
		// An empty cell still gets its line.
		if (n >= 0 ? open || ops.length === n : key && open) endLine(inner)
	}
	walk(parsed.body, {}, { key: 'p' }, false)
	return ops
}

/** Untrusted ops: known embeds only, attributes objects only (`pasteDelta` checks the rest). */
function cleanOps(v: unknown): DeltaOp[] | undefined {
	if (!Array.isArray(v)) return
	const ops: DeltaOp[] = []
	for (const op of v as DeltaOp[]) {
		const ins = op?.insert
		if (typeof ins !== 'string' && !validEmbed(ins)) continue
		const a = isObj(op.attributes) ? op.attributes : undefined
		ops.push(a ? { insert: ins, attributes: a } : { insert: ins })
	}
	return ops
}

/** Our Delta from the clipboard, validated: known embeds only, known attrs only. */
export function readDelta(json: string): DeltaOp[] | undefined {
	try {
		return cleanOps((JSON.parse(json) as { ops?: unknown }).ops)
	} catch {
		return
	}
}

/**
 * Frame snapshots of the `{ frame }` markers in our Delta JSON (`frames`, keyed by marker id):
 * the frame as read (`frameOf`) and, for a text box, its story's ops. Untrusted until
 * `pasteFrame`.
 */
export type ClipFrames = Record<string, { f: StoredFrame; text?: DeltaOp[] }>

/** The `frames` of our Delta JSON (unvalidated: `pasteFrame` checks each one it uses). */
export function readFrames(json: string): ClipFrames | undefined {
	try {
		const v = (JSON.parse(json) as { frames?: unknown }).frames
		return isObj(v) ? (v as ClipFrames) : undefined
	} catch {
		return
	}
}

/** Frames one paste may create (the engine wraps around at most WRAP_FRAMES_MAX = 256 per page). */
// Pasted text ops are uncapped, as plain / rich text paste is everywhere else.
const MAX_PASTE_FRAMES = 256
/** Largest pasted frame offset / size: 14400 pt, PDF's maximum page side. */
const PASTE_GEOM_MAX = 14400 * FX

/** Snapshots of the frames whose winning markers lie in `[from, to)` of `story`. */
export function copyFrames(
	doc: YPagilloDocument,
	story: string,
	from: number,
	to: number
): ClipFrames | undefined {
	const out: ClipFrames = {}
	for (const [id, w] of markerWins(doc, story)) {
		const f = !w.frame && w.at >= from && w.at < to ? frameOf(doc, id) : undefined
		if (!f) continue
		const st = f.t === 'txt' ? (f.data as StoredTextFrameData).story : undefined
		const t = st ? doc.tx.get(st) : undefined
		out[id] = t ? { f, text: stripBlockIds(deltaOf(t)) } : { f }
	}
	return Object.keys(out).length ? out : undefined
}

const FITS = new Set(['fill', 'contain', 'cover'])

/**
 * Only the `data` keys frame type `t` declares (`stored-types.ts`): sizes clamped to
 * [0, PASTE_GEOM_MAX], colours kept when strings of at most 64 characters. `crop`/`px` come
 * validated by `readFrame`; a text frame's `story` is replaced by the caller. `fileId` ≤ 256 and
 * `alt` ≤ 2000 characters (a longer `alt` is cleared).
 */
function pasteData(t: StoredFrame['t'], d: Record<string, unknown>): StoredFrame['data'] {
	const out: Record<string, unknown> = {}
	const str = (k: string, max = Number.POSITIVE_INFINITY) => {
		const v = d[k]
		if (typeof v === 'string' && v.length <= max) out[k] = v
	}
	const size = (k: string) => {
		const v = d[k]
		if (typeof v === 'number' && Number.isFinite(v)) out[k] = clamp(v, 0, PASTE_GEOM_MAX)
	}
	if (t === 'img') {
		str('fileId', 256)
		out.crop = d.crop
		if (d.px) out.px = d.px
		out.fit = typeof d.fit === 'string' && FITS.has(d.fit) ? d.fit : 'contain'
		out.alt = typeof d.alt === 'string' && d.alt.length <= 2000 ? d.alt : ''
		if (d.deco === true) out.deco = true
		return out
	}
	str('fill', 64)
	str('stroke', 64)
	size('strokeW')
	if (t === 'txt') size('inset')
	if (t === 'shp') out.kind = d.kind === 'ellipse' ? 'ellipse' : 'rect'
	return out as StoredFrame['data']
}

/**
 * Clone clipboard snapshot `c` as a new frame text-anchored to section story `story`; its fresh
 * id, or `undefined` when invalid (`emb` frames and `img` frames without a `fileId` are refused,
 * as `emb` embeds are). A text box gets a new story holding its pasted text. Inside the caller's
 * transaction.
 */
function pasteFrame(doc: YPagilloDocument, c: unknown, story: string): string | undefined {
	if (!isObj(c) || !isObj(c.f)) return
	let f: StoredFrame | undefined
	try {
		// Validate by the reader: write the snapshot into a scratch map and read it back.
		const m = new Y.Doc().getMap<unknown>('f')
		m.set('x', newFrameMap(c.f as unknown as StoredFrame))
		f = readFrame(m.get('x'))
	} catch {
		return
	}
	if (!f || f.t === 'emb' || !('txt' in f.anchor)) return
	const g = (v: number, lo: number) => clamp(v, lo, PASTE_GEOM_MAX)
	const w = g(f.w, FX)
	const h = g(f.h, FX)
	f = {
		...f,
		x: g(f.x, 0),
		y: g(f.y, 0),
		w,
		h,
		...(f.wCol === undefined ? {} : { wCol: clamp(f.wCol, 0.05, 1) }),
		rot: clamp(f.rot, -180, 180),
		z: clamp(Math.round(f.z), -1e6, 1e6),
		wrap: { ...f.wrap, off: clamp(f.wrap.off, 0, Math.max(w, h)) },
		data: pasteData(f.t, f.data as Record<string, unknown>)
	}
	let data = f.data
	if (f.t === 'img' && !(data as StoredImageData).fileId) return
	if (f.t === 'txt') {
		const sid = newId()
		doc.tx.set(sid, new Y.Text())
		const body = doc.tx.get(sid)
		if (body) pasteDelta(doc, body, 0, cleanOps(c.text) ?? [])
		data = { ...(f.data as StoredTextFrameData), story: sid, chain: undefined }
	}
	const id = newId()
	doc.f.set(id, newFrameMap({ ...f, anchor: { ...f.anchor, txt: story }, data }))
	return id
}

/**
 * Insert a rich fragment at `at` (inside the caller's transaction); returns the offset after it.
 * Each `'\n'` takes its pasted line attrs with a fresh `bid` (Quill semantics: the paragraph the
 * paste lands in keeps its own attrs on its tail). Style / character-style ids this publication
 * lacks are dropped; footnote refs are kept (with a copied body) only for this publication's
 * footnotes pasted into a section story's top-level text, where refs render; links are
 * re-checked. Table lines get fresh row / cell ids (quillo's `normalizeTablePasteDelta`),
 * `table-col` lines are dropped, and inside a cell every pasted line joins that cell.
 * A `{ frame }` marker is kept the same way, with its `frames` snapshot cloned under a fresh id
 * (`pasteFrame`; each snapshot once per paste, so no duplicate marker); otherwise dropped, and
 * a dropped one that had a snapshot counts in `dropped.n`.
 */
export function pasteDelta(
	doc: YPagilloDocument,
	t: Y.Text,
	at: number,
	ops: DeltaOp[],
	frames?: ClipFrames,
	dropped?: { n: number }
): number {
	const out: DeltaOp[] = []
	const target = paragraphEnd(t, at)?.attrs
	const into = cellOf(target)
		? Object.fromEntries(TABLE_KEYS.map((k) => [k, target?.[k] ?? null]))
		: undefined
	// A leading table starts a line: the text before the caret keeps a paragraph of its own.
	if (!into) {
		const nl = ops.find((op) => typeof op.insert === 'string' && op.insert.includes('\n'))
		if (nl && cellOf(nl.attributes) !== undefined) at = breakBefore(t, at)
	}
	let pos = at
	const rows = new Map<string, string>()
	/** Keyed by (old row, old cell): pasted cell ids repeat across rows. */
	const cells = new Map<string, string>()
	const tableAttrs = (a: Record<string, unknown>): Record<string, unknown> | undefined => {
		if (into) return into
		const cell = cellOf(a)
		if (cell === undefined) return
		if (!cell) {
			const tmp = a['table-temporary']
			const b = isObj(tmp) ? tmp['data-borders'] : undefined
			return {
				'table-temporary':
					typeof b === 'string' && BORDERS.has(b) ? { 'data-borders': b } : {}
			}
		}
		const old = rowOf(a) ?? ''
		const row = rows.get(old) ?? newRowId()
		rows.set(old, row)
		const key = `${old}\u0000${cell}`
		const id = cells.get(key) ?? newCellId()
		cells.set(key, id)
		const th = a['table-th'] != null
		const src = a[th ? 'table-th' : 'table-cell']
		const ca: Record<string, unknown> = { 'data-row': row }
		for (const k of ['colspan', 'rowspan']) {
			const v = isObj(src) ? src[k] : undefined
			const n = span(v)
			if (n) ca[k] = n
		}
		return {
			[th ? 'table-th' : 'table-cell']: ca,
			[th ? 'table-th-block' : 'table-cell-block']: id
		}
	}
	/** The section story pasted into (top-level text only), where refs and markers render. */
	const flow = into ? undefined : [...flowStories(doc).keys()].find((st) => doc.tx.get(st) === t)
	const notesOk = !!flow
	const cloned = new Set<string>()
	const src = stripBlockIds(ops)
	/** Per op: its line (ended by the next `'\n'`) is a table line. */
	const cellLine: boolean[] = []
	let inCell = false
	for (let i = src.length - 1; i >= 0; i--) {
		const op = src[i]
		if (typeof op.insert === 'string' && op.insert.includes('\n'))
			inCell = cellOf(op.attributes) !== undefined
		cellLine[i] = inCell
	}
	for (const [i, op] of src.entries()) {
		const a = op.attributes ?? {}
		if (a['table-col'] != null) continue
		// A pasted table's own end line would leave an empty line in the cell.
		if (into && a['table-temporary'] != null && op.insert === '\n') continue
		const marks: Record<string, unknown> = { ...NO_MARKS }
		for (const k of MARK_KEYS) if (typeof a[k] === MARK_TYPES[k]) marks[k] = a[k]
		if (marks.cs && !styleOf(doc, marks.cs as string)) marks.cs = null
		if (marks.size != null && !(isNum(marks.size) && marks.size > 0)) marks.size = null
		if (marks.link != null) marks.link = safeLink(marks.link) ?? null
		if (typeof op.insert !== 'string') {
			let e = op.insert as Record<string, unknown>
			if (typeof e.fn === 'string') {
				const r = doc.f.get(e.fn)
				if (!notesOk || cellLine[i] || !(r instanceof Y.Map && r.get('t') === 'fn'))
					continue
				// A pasted ref gets its own body: two refs to one story would share the note.
				e = { ...e, fn: copyStory(doc, e.fn, false) }
			}
			if (typeof e.frame === 'string') {
				const old = e.frame
				const snap = !!frames && Object.hasOwn(frames, old) && !cloned.has(old)
				const ok = snap && flow && !cellLine[i] && cloned.size < MAX_PASTE_FRAMES
				const id = ok ? pasteFrame(doc, frames[old], flow) : undefined
				if (!id) {
					if (snap && dropped) dropped.n++
					continue
				}
				cloned.add(old)
				e = { frame: id }
			}
			out.push({ insert: e, attributes: { ...marks, ...NO_LINE } })
			pos++
			continue
		}
		op.insert.split('\n').forEach((part, i) => {
			if (i) {
				const ps = typeof a.ps === 'string' && styleOf(doc, a.ps) ? a.ps : null
				pos++
				out.push({
					insert: '\n',
					attributes: {
						...NO_MARKS,
						...NO_LINE,
						bid: newBlockId(),
						ps,
						po: sanitizeOverrides(a.po) ?? null,
						list: a.list === 'bullet' || a.list === 'ordered' ? a.list : null,
						indent:
							isNum(a.indent) && a.indent > 0
								? Math.min(8, Math.floor(a.indent))
								: null,
						...tableAttrs(a)
					}
				})
			}
			if (part) {
				out.push({ insert: part, attributes: { ...marks, ...NO_LINE } })
				pos += part.length
			}
		})
	}
	// One delta, not an insert per line: per-insert position lookups made book pastes O(n²).
	if (out.length) t.applyDelta([{ retain: at }, ...out])
	return pos
}

/** Pasting a `cl:` ref as an embed (`onLink` absent = it pastes as text). */
export interface ClipboardEmbeds {
	/** This document's file id (the embed's host). */
	sourceFileId?: string
	/** The linked target and the ref's owner idTag. */
	onLink?(link: DocLinkResult, owner: string): void | Promise<void>
	/** False refuses the paste before any share is granted (it shows its own notice). */
	canLink?(appId: string): boolean
}

/**
 * Copy/cut/paste for the editor selection, as document listeners (the focus target varies).
 * Cut/paste go through `editor.run`, which refuses readers and `readOnlyReason` itself.
 */
export function useClipboard(ctx: CommandCtx, embeds?: ClipboardEmbeds): void {
	const { t } = useTranslation()
	const toast = useToast()
	const ui = React.useRef({ t, toast })
	ui.current = { t, toast }
	const cur = React.useRef(ctx)
	cur.current = ctx
	const emb = React.useRef(embeds)
	emb.current = embeds

	React.useEffect(() => {
		/**
		 * Ours unless a form field with its own selection (or any `<input>`, e.g. the Find bar)
		 * has focus. A heuristic on the target; a marker on the input adapter would be exact.
		 */
		const ours = (e: ClipboardEvent) => {
			const el = e.target
			if (el instanceof HTMLInputElement) return false
			if (el instanceof HTMLTextAreaElement && el.selectionStart !== el.selectionEnd)
				return false
			// Pages are `user-select: none`: a DOM selection is the user's, somewhere else.
			if (document.getSelection()?.isCollapsed === false) return false
			return !!cur.current.editor.sel
		}
		const copy = (e: ClipboardEvent) => {
			const { editor, doc } = cur.current
			const s = editor.sel
			if (!ours(e) || !s || s.anchor === s.head || !e.clipboardData) return
			const t = doc.tx.get(s.story)
			if (!t) return
			const from = C.selFrom(s)
			const to = C.selTo(s)
			const ops = stripBlockIds(sliceDelta(deltaOf(t), from, to))
			// `{ v, ops, frames? }`: frames carry the anchored frames' snapshots (`ClipFrames`).
			const frames = ops.some((op) => isObj(op.insert) && 'frame' in op.insert)
				? copyFrames(doc, s.story, from, to)
				: undefined
			e.clipboardData.setData('text/plain', deltaToPlain(ops))
			e.clipboardData.setData('text/html', deltaToHtml(doc, ops))
			e.clipboardData.setData(DELTA_MIME, JSON.stringify({ v: 1, ops, frames }))
			e.preventDefault()
			if (e.type === 'cut') {
				editor.run((tx, from, to) => {
					deleteRange(tx, from, to)
					return from
				})
			}
		}
		const paste = (e: ClipboardEvent) => {
			const { editor, doc } = cur.current
			const data = e.clipboardData
			if (!ours(e) || !data) return
			// A `cl:` ref becomes an embed (Insert › Embed…); `linkFromPaste` takes the event.
			const ref = embedTarget({ address: data.getData('text/plain') })
			const { sourceFileId, onLink, canLink } = emb.current ?? {}
			if (ref && sourceFileId && onLink) {
				if (canLink?.(ref.appId) === false) {
					e.preventDefault()
					return
				}
				const linking = getAppBus().linkFromPaste(e, sourceFileId)
				if (linking) {
					const { owner } = ref
					void linking
						.then((l) => l && onLink(l, owner))
						.catch((err) => console.warn('[pagillo] embed paste failed:', err))
					return
				}
			}
			e.preventDefault()
			const json = data.getData(DELTA_MIME)
			let ops = json ? readDelta(json) : undefined
			const frames = json ? readFrames(json) : undefined
			const html = ops?.length ? '' : data.getData('text/html')
			if (html) ops = htmlToDelta(doc, html)
			const plain = data.getData('text/plain').replace(/\r\n?/g, '\n')
			if (!ops?.length && !plain) return
			const dropped = { n: 0 }
			editor.run((t, from, to) => {
				deleteRange(t, from, to)
				return ops?.length
					? pasteDelta(doc, t, from, ops, frames, dropped)
					: insertText(t, from, plain)
			})
			if (dropped.n > 0)
				ui.current.toast.warning(ui.current.t('Some anchored objects could not be pasted.'))
		}
		document.addEventListener('copy', copy)
		document.addEventListener('cut', copy)
		document.addEventListener('paste', paste)
		return () => {
			document.removeEventListener('copy', copy)
			document.removeEventListener('cut', copy)
			document.removeEventListener('paste', paste)
		}
	}, [])
}

// vim: ts=4
