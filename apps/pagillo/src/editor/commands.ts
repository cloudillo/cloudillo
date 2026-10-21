// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * Text commands (toolbar, keymap, Format panel, pages rail). Every write goes through
 * `Editor.run` (one local transaction, refused for readers and while `readOnlyReason` is set);
 * the bid normaliser follows it.
 */

import type { Marks, ParagraphProps } from '@cloudillo/typeset'
import type * as Y from 'yjs'

import { newBlockId } from '../crdt/block-ids'
import { deltaOf } from '../crdt/delta-cache'
import { newSectionMap, sectionOf, sectionsOf, styleOf } from '../crdt/entities'
import { newId, type StyleId } from '../crdt/ids'
import { createStory } from '../crdt/story-ops'
import {
	LINE_KEYS,
	MARK_KEYS,
	type StoredInlineEmbed,
	type StoredLineAttrs,
	type StoredStyle,
	type StyleMapKey,
	type YPagilloDocument
} from '../crdt/stored-types'
import { updateStyle } from '../crdt/style-ops'
import {
	cellOf,
	colSpanOf,
	type DeltaOp,
	isTableLine,
	newCellId,
	newRowId,
	readMeta,
	rowOf
} from '../crdt/type-converters'
import * as C from './caret'
import { sliceDelta } from './clipboard'
import { breakBefore, deleteRange, insertText } from './text-edit'
import type { Editor } from './useEditor'

export interface CommandCtx {
	yDoc: Y.Doc
	doc: YPagilloDocument
	editor: Editor
}

export type ToggleMark = 'bold' | 'italic' | 'underline' | 'strike'
/** Paragraph override patch; `undefined` removes the override. */
export type ParagraphPatch = { [K in keyof ParagraphProps]?: ParagraphProps[K] | undefined }

/** Marks that "Clear formatting" removes (link stays). */
const FORMAT_MARKS = MARK_KEYS.filter((k) => k !== 'link')
/** All line attrs null: Yjs would otherwise copy the neighbour's onto an inserted embed. */
const NO_LINE = Object.fromEntries(LINE_KEYS.map((k) => [k, null]))

interface Line {
	/** Offset of the paragraph's `'\n'`. */
	index: number
	attrs: StoredLineAttrs
}

/** The `'\n'`s ending the paragraphs that intersect `[from, to]`. */
export function paragraphsIn(t: Y.Text, from: number, to: number): Line[] {
	const out: Line[] = []
	let pos = 0
	for (const op of deltaOf(t)) {
		if (typeof op.insert !== 'string') {
			pos++
			continue
		}
		for (let i = op.insert.indexOf('\n'); i >= 0; i = op.insert.indexOf('\n', i + 1)) {
			const index = pos + i
			if (index < from) continue
			out.push({ index, attrs: (op.attributes ?? {}) as Line['attrs'] })
			if (index >= to) return out
		}
		pos += op.insert.length
	}
	return out
}

/** Marks shared by every character of `[from, to)`; collapsed: the character typing would copy. */
export function marksIn(t: Y.Text, from: number, to: number): Marks {
	const txt = C.storyText(t)
	if (from === to) {
		if (from > 0 && txt[from - 1] !== '\n') from--
		else if (txt[from] !== '\n') to++
		else return {}
	}
	let out: Record<string, unknown> | undefined
	let pos = 0
	for (const op of deltaOf(t)) {
		const len = typeof op.insert === 'string' ? op.insert.length : 1
		const seg = typeof op.insert === 'string' ? op.insert : '￼'
		if (pos < to && pos + len > from && seg.replaceAll('\n', '') !== '') {
			const a = op.attributes ?? {}
			if (!out) out = Object.fromEntries(Object.entries(a).filter(([k]) => !(k in NO_LINE)))
			else for (const k of Object.keys(out)) if (a[k] !== out[k]) delete out[k]
		}
		pos += len
		if (pos >= to) break
	}
	return (out ?? {}) as Marks
}

/** Format the characters of `[from, to)`, skipping the paragraph `'\n'`s (they carry line attrs). */
function formatChars(t: Y.Text, from: number, to: number, attrs: Record<string, unknown>) {
	const txt = C.storyText(t)
	let a = from
	for (let i = from; i <= to; i++) {
		if (i === to || txt[i] === '\n') {
			if (i > a) t.format(a, i - a, attrs)
			a = i + 1
		}
	}
}

/** Props inherited along the `basedOn` chain (cycle-safe), nearest ancestor wins. */
export function inheritedProps(
	doc: YPagilloDocument,
	id: StyleId | undefined
): Record<string, unknown> {
	const chain: StoredStyle[] = []
	const seen = new Set<string>()
	for (let cur = id; cur && !seen.has(cur); cur = styleOf(doc, cur)?.basedOn) {
		seen.add(cur)
		const s = styleOf(doc, cur)
		if (s) chain.unshift(s)
	}
	return Object.assign({}, ...chain.map((s) => s.props))
}

const styleMap = (doc: YPagilloDocument) => readMeta(doc.m).styleMap

export interface TextState {
	/** Paragraph style of every selected paragraph, or undefined when mixed. */
	ps?: string
	/** Direct overrides of the first paragraph. */
	po: Partial<ParagraphProps>
	list?: 'bullet' | 'ordered'
	indent: number
	/** Marks shared by the whole selection. */
	marks: Marks
	/** Effective paragraph props (style chain + overrides) of the first paragraph. */
	eff: Record<string, unknown>
	/** "Body +": direct paragraph overrides or formatting marks. */
	overrides: boolean
	/** The caret's table (row/col of the caret cell, 0-based). */
	table?: {
		rows: number
		cols: number
		row: number
		col: number
		header: boolean
		borders: TableBorders
	}
}

export function textState(
	doc: YPagilloDocument,
	sel: C.EditorSelection | undefined
): TextState | undefined {
	const t = sel && doc.tx.get(sel.story)
	if (!sel || !t) return
	const paras = paragraphsIn(t, C.selFrom(sel), C.selTo(sel))
	const first = paras[0]?.attrs ?? {}
	const ps = paras.every((p) => p.attrs.ps === first.ps) ? first.ps : undefined
	const po = first.po ?? {}
	const marks = marksIn(t, C.selFrom(sel), C.selTo(sel))
	const tb = tableAt(t, C.selFrom(sel))
	return {
		ps,
		po,
		list: first.list,
		indent: first.indent ?? 0,
		marks,
		eff: { ...inheritedProps(doc, first.ps), ...po },
		overrides: Object.keys(po).length > 0 || FORMAT_MARKS.some((k) => k in marks),
		...(tb && {
			table: {
				rows: tb.rows.length,
				cols: colsOf(tb),
				row: tb.row,
				col: tb.col,
				header: tb.rows[0].th,
				borders: tb.temp?.attrs['table-temporary']?.['data-borders'] ?? 'all'
			}
		})
	}
}

/** Toggle a raw mark on the selection; collapsed is a no-op (no pending marks for typing). */
export function toggleMark({ editor }: CommandCtx, mark: ToggleMark): void {
	editor.run((t, from, to) => {
		if (from === to) return
		formatChars(t, from, to, { [mark]: marksIn(t, from, to)[mark] ? null : true })
	})
}

/** Set (or with `null` remove) a value mark: color, font, size (Fx), link, cs. */
export function setMark(
	{ editor }: CommandCtx,
	mark: 'color' | 'font' | 'size' | 'link' | 'cs',
	value: string | number | null
): void {
	editor.run((t, from, to) => {
		if (from !== to) formatChars(t, from, to, { [mark]: value })
	})
}

function formatParagraphs(
	editor: Editor,
	fn: (attrs: Line['attrs']) => Record<string, unknown> | undefined
): void {
	editor.run((t, from, to) => {
		for (const p of paragraphsIn(t, from, to)) {
			const a = fn(p.attrs)
			if (a) t.format(p.index, 1, a)
		}
	})
}

export function setParagraphStyle({ editor }: CommandCtx, id: StyleId): void {
	formatParagraphs(editor, () => ({ ps: id }))
}

/** Ctrl+Alt+0–3: apply the `m.styleMap` style of a block type. */
export function applyStyleKey(ctx: CommandCtx, key: StyleMapKey): boolean {
	const id = styleMap(ctx.doc)[key]
	if (!id) return false
	setParagraphStyle(ctx, id)
	return true
}

/** Merge direct paragraph overrides (`po`); an `undefined` value drops that override. */
export function setParagraphProps({ editor }: CommandCtx, patch: ParagraphPatch): void {
	formatParagraphs(editor, (a) => {
		const po: Record<string, unknown> = { ...a.po, ...patch }
		for (const k of Object.keys(po)) if (po[k] === undefined) delete po[k]
		return { po: Object.keys(po).length ? po : null }
	})
}

/** Toggle a list kind on the selected paragraphs (same kind again removes it). */
export function toggleList(ctx: CommandCtx, kind: 'bullet' | 'ordered'): void {
	const off = textState(ctx.doc, ctx.editor.sel)?.list === kind
	formatParagraphs(ctx.editor, () => (off ? { list: null, indent: null } : { list: kind }))
}

/** List nesting ±1 (0–8); outdenting level 0 ends the list. False when not in a list. */
export function indentList(ctx: CommandCtx, dir: -1 | 1): boolean {
	if (!textState(ctx.doc, ctx.editor.sel)?.list) return false
	formatParagraphs(ctx.editor, (a) => {
		if (!a.list) return
		const n = (a.indent ?? 0) + dir
		if (n < 0) return { list: null, indent: null }
		return { indent: Math.min(8, n) || null }
	})
	return true
}

export function insertTab({ editor }: CommandCtx): void {
	editor.run((t, from, to) => {
		deleteRange(t, from, to)
		return insertAt(t, from, '\t')
	})
}

function insertAt(t: Y.Text, at: number, text: string): number {
	t.insert(at, text, { ...marksIn(t, at, at), ...NO_LINE })
	return at + text.length
}

/** Insert a field embed at the caret (date `fixed` with `d`, or `export`). */
export function insertField({ editor }: CommandCtx, field: StoredInlineEmbed): void {
	editor.run((t, from, to) => {
		deleteRange(t, from, to)
		t.insertEmbed(from, field, { ...marksIn(t, from, from), ...NO_LINE })
		return from + 1
	})
}

/**
 * Split the story at the caret into a new section after the current one (same masters); the
 * caret moves to the new section's start. Not available in text-box stories.
 */
export function insertSectionBreak({ doc, editor }: CommandCtx): void {
	const story = editor.sel?.story
	const secId = sectionsOf(doc).find(([, s]) => s.story === story)?.[0]
	const sec = secId ? sectionOf(doc, secId) : undefined
	if (!secId || !sec) return
	let next: string | undefined
	editor.run((t, from, to) => {
		deleteRange(t, from, to)
		// Split mid-paragraph first, so the tail starts at a paragraph start.
		const at = breakBefore(t, from)
		// Uncached on purpose: `applyDelta` writes nulls into the ops' attribute objects.
		const tail = sliceDelta(t.toDelta() as DeltaOp[], at, t.length)
		const body = styleMap(doc).p
		const id = createStory(doc, tail.length ? [] : [{ ps: body }])
		doc.tx.get(id)?.applyDelta(tail)
		t.delete(at, t.length - at)
		if (t.length === 0) t.insert(0, '\n', { bid: newBlockId(), ...(body ? { ps: body } : {}) })
		const { pageNum: _p, maxPages: _m, ...rest } = sec
		const sid = newId()
		doc.s.set(sid, newSectionMap({ ...rest, story: id }))
		doc.secs.insert(doc.secs.toArray().indexOf(secId) + 1, [sid])
		next = id
	})
	if (next) editor.select({ story: next, anchor: 0, head: 0 })
}

/** Mark → style prop for "Update <style> to match". */
const MARK_PROPS: [keyof Marks, string, (v: unknown) => unknown][] = [
	['font', 'font', (v) => v],
	['size', 'size', (v) => v],
	['color', 'color', (v) => v],
	['italic', 'italic', (v) => v],
	['underline', 'underline', (v) => v],
	['strike', 'strike', (v) => v],
	['bold', 'weight', (v) => (v ? 700 : undefined)]
]

/** Redefine the caret paragraph's style from its overrides and shared marks, then drop them. */
export function redefineStyle({ yDoc, doc, editor }: CommandCtx): void {
	editor.run((t, from) => {
		const [p] = paragraphsIn(t, from, from)
		const id = p?.attrs.ps
		if (!p || !id) return
		const [a] = C.paragraphAt(C.storyText(t), from)
		const marks = marksIn(t, a, p.index) as Record<string, unknown>
		const props: Record<string, unknown> = { ...p.attrs.po }
		for (const [m, k, f] of MARK_PROPS) if (m in marks) props[k] = f(marks[m])
		updateStyle(yDoc, doc, id, { props } as Partial<Omit<StoredStyle, 'k'>>)
		t.format(p.index, 1, { po: null })
		formatChars(t, a, p.index, Object.fromEntries(MARK_PROPS.map(([m]) => [m, null])))
	})
}

/** "Clear formatting": drop paragraph overrides and formatting marks (links stay). */
export function clearOverrides({ editor }: CommandCtx): void {
	editor.run((t, from, to) => {
		const paras = paragraphsIn(t, from, to)
		const a = from === to ? C.paragraphAt(C.storyText(t), from)[0] : from
		const b = from === to ? (paras[0]?.index ?? to) : to
		formatChars(t, a, b, Object.fromEntries(FORMAT_MARKS.map((m) => [m, null])))
		for (const p of paras) t.format(p.index, 1, { po: null })
	})
}

/**
 * Heading nudge: a single-line Body paragraph ≥ 1.3× Body size or bold throughout,
 * not dismissed (`nh: 1`). Returns the paragraph's `'\n'` offset.
 */
export function headingNudge({ doc, editor }: CommandCtx): number | undefined {
	const sel = editor.sel
	const t = sel && doc.tx.get(sel.story)
	const map = styleMap(doc)
	if (!sel || !t || !map.p || !map.h2) return
	const [p] = paragraphsIn(t, sel.head, sel.head)
	if (!p || p.attrs.ps !== map.p || p.attrs.nh || !p.attrs.bid) return
	const [a] = C.paragraphAt(C.storyText(t), sel.head)
	if (a === p.index) return
	const lines = editor.index.stories.get(sel.story) ?? []
	if (lines.filter((l) => l.line.bid === p.attrs.bid).length !== 1) return
	const marks = marksIn(t, a, p.index)
	const body = Number(inheritedProps(doc, map.p).size) || 0
	const big = !!marks.size && !!body && marks.size >= 1.3 * body
	return big || marks.bold ? p.index : undefined
}

export function applyHeadingNudge(ctx: CommandCtx): void {
	applyStyleKey(ctx, 'h2')
}

export function dismissHeadingNudge({ editor }: CommandCtx): void {
	formatParagraphs(editor, () => ({ nh: 1 }))
}

/**
 * Enter's "next style": a new empty paragraph after a heading (style with `tocLevel`) gets the
 * Body style without overrides. Call inside the Enter transaction with the caret after it.
 */
export function applyNextStyle(doc: YPagilloDocument, t: Y.Text, caret: number): void {
	const [cur] = paragraphsIn(t, caret, caret)
	const [prev] = caret > 0 ? paragraphsIn(t, caret - 1, caret - 1) : []
	if (!cur || cur.index !== caret || !prev?.attrs.ps) return
	if (!inheritedProps(doc, prev.attrs.ps).tocLevel) return
	t.format(cur.index, 1, { ps: styleMap(doc).p ?? null, po: null })
}

/** Story range shown on global page `page` (lines of `story` only). */
function pageRange(editor: Editor, story: string, page: number): [number, number] | undefined {
	const lines = (editor.index.pages.get(page) ?? []).filter((l) => l.line.story === story)
	if (!lines.length) return
	return [Math.min(...lines.map((l) => l.from)), Math.max(...lines.map((l) => l.to))]
}

/** "+ Add page": a paragraph starting on a new page after the text of `page`; caret moves there. */
export function addPage({ doc, editor }: CommandCtx, story: string, page: number): void {
	const t = doc.tx.get(story)
	if (!t) return
	const end = pageRange(editor, story, page)?.[1] ?? C.storyEnd(C.storyText(t))
	editor.select({ story, anchor: end, head: end })
	editor.run((t, from) => {
		const [p] = paragraphsIn(t, from, from)
		if (!p) return
		const caret = insertText(t, p.index, '\n')
		const [n] = paragraphsIn(t, caret, caret)
		if (n) t.format(n.index, 1, { po: { ...n.attrs.po, breakBefore: 'page' } })
		return caret
	})
}

/** "Delete page": delete the story range shown on `page` (the caller confirms first). */
export function deletePage({ editor }: CommandCtx, story: string, page: number): void {
	const r = pageRange(editor, story, page)
	if (!r) return
	editor.select({ story, anchor: r[0], head: r[1] })
	// The page's last paragraph mark stays (an empty paragraph may remain).
	editor.run((t, from, to) => {
		deleteRange(t, from, to)
		return from
	})
}

// Tables: quill-table-better lines (`StoredLineAttrs`), grouped as `deltaToParagraphs` does.

export type TableBorders = 'all' | 'outer' | 'header' | 'none'

export interface TableCellRef {
	id: string
	/** Offset of the cell's first character. */
	start: number
	/** Offset of the cell's last `'\n'`. */
	end: number
	/** Grid column it starts at, and how many it spans. */
	x: number
	span: number
}

export interface TableRowRef {
	id: string
	th: boolean
	cells: TableCellRef[]
}

export interface TableRef {
	/** Offset of the table's first line (its `table-temporary` line, when it has one). */
	from: number
	/** Offset after its last `'\n'`. */
	to: number
	temp?: Line
	rows: TableRowRef[]
	/** Row and grid column (its cell's first) holding the queried offset; 0 / 0 on the table line. */
	row: number
	col: number
}

// Rowspan ignored for grid columns; build a full grid once rowspan editing exists.
const isTemp = (l: Line) => !!l.attrs['table-temporary']
const rowEnd = (r: TableRowRef) => {
	const c = r.cells[r.cells.length - 1]
	return c.x + c.span
}
const colsOf = (tb: TableRef) => Math.max(...tb.rows.map(rowEnd))
/** The cell of `r` covering grid column `col`. */
const cellAtCol = (r: TableRowRef, col: number) =>
	r.cells.find((c) => c.x <= col && col < c.x + c.span)

/** Set a cell's `colspan` on all its lines. */
function setColSpan(t: Y.Text, c: TableCellRef, n: number): void {
	for (const l of paragraphsIn(t, c.start, c.end)) {
		const a = l.attrs as Record<string, Record<string, unknown> | undefined>
		const k = a['table-th'] != null ? 'table-th' : 'table-cell'
		const v = a[k]
		const o = v && typeof v === 'object' ? v : { 'data-row': v }
		t.format(l.index, 1, { [k]: { ...o, colspan: n > 1 ? String(n) : undefined } })
	}
}

/** `'\n'` attrs of a fresh cell paragraph. */
const cellLine = (row: string, cell: string, th: boolean, ps: string | null) => ({
	...NO_LINE,
	bid: newBlockId(),
	ps,
	[th ? 'table-th' : 'table-cell']: { 'data-row': row },
	[th ? 'table-th-block' : 'table-cell-block']: cell
})

/** The table holding offset `off`. */
export function tableAt(t: Y.Text, off: number): TableRef | undefined {
	const lines = paragraphsIn(t, 0, Number.POSITIVE_INFINITY)
	const i = lines.findIndex((l) => l.index >= off)
	if (i < 0 || !isTableLine(lines[i].attrs)) return
	// A `table-temporary` line starts a table.
	let a = i
	while (a > 0 && !isTemp(lines[a]) && isTableLine(lines[a - 1].attrs)) a--
	let b = i
	while (lines[b + 1] && isTableLine(lines[b + 1].attrs) && !isTemp(lines[b + 1])) b++
	const from = a > 0 ? lines[a - 1].index + 1 : 0
	const tb: TableRef = {
		from,
		to: lines[b].index + 1,
		temp: isTemp(lines[a]) ? lines[a] : undefined,
		rows: [],
		row: 0,
		col: 0
	}
	let start = from
	for (let k = a; k <= b; k++) {
		const l = lines[k]
		const cell = cellOf(l.attrs)
		if (cell) {
			const id = rowOf(l.attrs) ?? ''
			let r = tb.rows[tb.rows.length - 1]
			if (r?.id !== id) {
				r = { id, th: l.attrs['table-th'] != null, cells: [] }
				tb.rows.push(r)
			}
			let c = r.cells[r.cells.length - 1]
			if (c?.id !== cell) {
				const x = c ? c.x + c.span : 0
				c = { id: cell, start, end: l.index, x, span: colSpanOf(l.attrs) }
				r.cells.push(c)
			}
			c.end = l.index
			if (k === i) {
				tb.row = tb.rows.length - 1
				tb.col = c.x
			}
		}
		start = l.index + 1
	}
	return tb.rows.length ? tb : undefined
}

/** Make sure a paragraph starts at `at` (inserting an empty Body one at the story end). */
function paragraphAtEnd(doc: YPagilloDocument, t: Y.Text, at: number): number {
	if (at >= t.length)
		t.insert(at, '\n', { ...NO_LINE, bid: newBlockId(), ps: styleMap(doc).p ?? null })
	return at
}

function deleteTable(doc: YPagilloDocument, t: Y.Text, tb: TableRef): number {
	t.delete(tb.from, tb.to - tb.from)
	return paragraphAtEnd(doc, t, tb.from)
}

/**
 * Insert a `cols` × `rows` table before the caret's paragraph (split at the caret first); the
 * caret moves into the first cell. Refused inside a table (no nested tables).
 */
export function insertTable(
	{ doc, editor }: CommandCtx,
	cols: number,
	rows: number,
	header = true
): void {
	editor.run((t, from, to) => {
		if (tableAt(t, from) || tableAt(t, to)) return
		deleteRange(t, from, to)
		const at = breakBefore(t, from)
		const ps = styleMap(doc).p ?? null
		const ops: DeltaOp[] = [
			{ insert: '\n', attributes: { ...NO_LINE, bid: newBlockId(), 'table-temporary': {} } }
		]
		for (let r = 0; r < rows; r++) {
			const row = newRowId()
			for (let c = 0; c < cols; c++) {
				ops.push({
					insert: '\n',
					attributes: cellLine(row, newCellId(), header && r === 0, ps)
				})
			}
		}
		t.applyDelta([{ retain: at }, ...ops])
		return at + 1
	})
}

/** A row above / below the caret's (a header row stays on top); the caret moves into it. */
export function tableInsertRow({ doc, editor }: CommandCtx, below: boolean): void {
	editor.run((t, from) => {
		const tb = tableAt(t, from)
		if (!tb) return
		const r = tb.rows[tb.row]
		const at = below ? r.cells[r.cells.length - 1].end + 1 : r.cells[0].start
		const row = newRowId()
		const th = !below && r.th
		const ps = styleMap(doc).p ?? null
		const ops = Array.from({ length: colsOf(tb) }, () => ({
			insert: '\n',
			attributes: cellLine(row, newCellId(), th, ps)
		}))
		t.applyDelta([{ retain: at }, ...ops])
		return at
	})
}

/**
 * A grid column left / right of the caret's cell; the caret moves into its new cell. A cell
 * spanning the new column's edge grows instead.
 */
export function tableInsertCol({ doc, editor }: CommandCtx, right: boolean): void {
	editor.run((t, from) => {
		const tb = tableAt(t, from)
		if (!tb) return
		const ps = styleMap(doc).p ?? null
		const own = cellAtCol(tb.rows[tb.row], tb.col)
		const edge = right && own ? own.x + own.span : tb.col
		// Edge at a cell start (or past a short row's end) inserts; reverse order keeps offsets.
		const ats = tb.rows.map((r): number | undefined => {
			const c = cellAtCol(r, edge)
			if (c && c.x < edge) {
				setColSpan(t, c, c.span + 1)
				return undefined
			}
			return c ? c.start : r.cells[r.cells.length - 1].end + 1
		})
		for (let i = tb.rows.length - 1; i >= 0; i--) {
			const at = ats[i]
			if (at !== undefined)
				t.insert(at, '\n', cellLine(tb.rows[i].id, newCellId(), tb.rows[i].th, ps))
		}
		const at = ats[tb.row]
		if (at === undefined) return
		// Each row above that got a cell shifts the caret's by one.
		return at + ats.slice(0, tb.row).filter((a) => a !== undefined).length
	})
}

/** Delete the caret's row (the last one: the whole table), lines and all. */
export function tableDeleteRow({ doc, editor }: CommandCtx): void {
	editor.run((t, from) => {
		const tb = tableAt(t, from)
		if (!tb) return
		if (tb.rows.length === 1) return deleteTable(doc, t, tb)
		const r = tb.rows[tb.row]
		const a = r.cells[0].start
		t.delete(a, r.cells[r.cells.length - 1].end + 1 - a)
		return tb.row === tb.rows.length - 1 ? tb.rows[tb.row - 1].cells[0].start : a
	})
}

/**
 * Delete the caret's grid column (the last one: the whole table); a cell spanning it shrinks,
 * single-cell rows keep their cell.
 */
export function tableDeleteCol({ doc, editor }: CommandCtx): void {
	editor.run((t, from) => {
		const tb = tableAt(t, from)
		if (!tb) return
		if (colsOf(tb) === 1) return deleteTable(doc, t, tb)
		const cuts = tb.rows.flatMap((r, i) => {
			const c = cellAtCol(r, tb.col)
			if (c && c.span > 1) setColSpan(t, c, c.span - 1)
			else if (c && r.cells.length > 1) return [{ i, a: c.start, n: c.end + 1 - c.start }]
			return []
		})
		for (const { a, n } of [...cuts].reverse()) t.delete(a, n)
		const r = tb.rows[tb.row]
		const own = cellAtCol(r, tb.col)
		const ci = own ? r.cells.indexOf(own) : 0
		const keep = !cuts.some((c) => c.i === tb.row)
			? from
			: r.cells[ci + 1]
				? r.cells[ci].start
				: (r.cells[ci - 1] ?? r.cells[0]).start
		return keep - cuts.filter((c) => c.i < tb.row).reduce((s, c) => s + c.n, 0)
	})
}

/** Table borders (`data-borders` on the `table-temporary` line; one is added when missing). */
export function setTableBorders({ editor }: CommandCtx, b: TableBorders): void {
	editor.run((t, from) => {
		const tb = tableAt(t, from)
		if (!tb) return
		const cur: NonNullable<StoredLineAttrs['table-temporary']> =
			tb.temp?.attrs['table-temporary'] ?? {}
		const { 'data-borders': _, ...rest } = cur
		const v = b === 'all' ? rest : { ...rest, 'data-borders': b }
		if (tb.temp) {
			t.format(tb.temp.index, 1, { 'table-temporary': v })
			return
		}
		t.insert(tb.from, '\n', { ...NO_LINE, bid: newBlockId(), 'table-temporary': v })
		return from + 1
	})
}

/** Toggle the first row between header (`table-th`) and body cells, ids kept. */
export function toggleHeaderRow({ editor }: CommandCtx): void {
	editor.run((t, from) => {
		const tb = tableAt(t, from)
		if (!tb) return
		const r = tb.rows[0]
		const [k, kb, nk, nkb] = r.th
			? ['table-th', 'table-th-block', 'table-cell', 'table-cell-block']
			: ['table-cell', 'table-cell-block', 'table-th', 'table-th-block']
		for (const l of paragraphsIn(t, r.cells[0].start, r.cells[r.cells.length - 1].end)) {
			const a = l.attrs as Record<string, unknown>
			if (a[k] != null)
				t.format(l.index, 1, { [k]: null, [kb]: null, [nk]: a[k], [nkb]: a[kb] })
		}
	})
}

/**
 * Tab / Shift+Tab: select the next / previous cell's text; Tab in the last cell adds a row.
 * False outside a table and on Shift+Tab in the first cell.
 */
export function tableCellMove(ctx: CommandCtx, dir: -1 | 1): boolean {
	const sel = ctx.editor.sel
	const t = sel && ctx.doc.tx.get(sel.story)
	const tb = t && tableAt(t, C.selFrom(sel))
	if (!sel || !tb) return false
	const cells = tb.rows.flatMap((r) => r.cells)
	const own = cellAtCol(tb.rows[tb.row], tb.col)
	const i = (own ? cells.indexOf(own) : 0) + dir
	if (i < 0) return false
	if (i >= cells.length) {
		tableInsertRow(ctx, true)
		return true
	}
	ctx.editor.select({ story: sel.story, anchor: cells[i].start, head: cells[i].end })
	return true
}

/** Esc in a table: caret to the paragraph after it (added at the story end). */
export function leaveTable({ doc, editor }: CommandCtx): boolean {
	const sel = editor.sel
	const t = sel && doc.tx.get(sel.story)
	const tb = t && tableAt(t, C.selFrom(sel))
	if (!sel || !t || !tb) return false
	if (tb.to < t.length) editor.select({ story: sel.story, anchor: tb.to, head: tb.to })
	else if (!editor.run((tx) => paragraphAtEnd(doc, tx, tb.to))) return false
	return true
}

/** Whether `story` is a section's story (footnotes and the TOC lay out in section flows only). */
export function isSectionStory(doc: YPagilloDocument, story: string | undefined): boolean {
	return !!story && sectionsOf(doc).some(([, s]) => s.story === story)
}

/**
 * Story and offset of the `{ fn: story }` ref, i.e. whether `story` is a footnote body.
 * Scans every story's delta (cached); index refs if books with many stories lag.
 */
export function footnoteRef(
	doc: YPagilloDocument,
	story: string | undefined
): { story: string; offset: number } | undefined {
	if (!story) return
	for (const [id, t] of doc.tx.entries()) {
		if (id === story) continue
		let pos = 0
		for (const op of deltaOf(t)) {
			if (typeof op.insert === 'string') pos += op.insert.length
			else if ((op.insert as { fn?: unknown }).fn === story) return { story: id, offset: pos }
			else pos++
		}
	}
}

/**
 * Insert a footnote ref at the caret of a section story: creates its body story (one Body
 * paragraph) in the same transaction and moves the caret into it.
 */
export function insertFootnote({ doc, editor }: CommandCtx): void {
	if (!isSectionStory(doc, editor.sel?.story)) return
	let body: string | undefined
	editor.run((t, from, to) => {
		if (tableAt(t, from)) return
		deleteRange(t, from, to)
		const ps = styleMap(doc).p
		body = createStory(doc, [ps ? { ps } : {}])
		t.insertEmbed(from, { fn: body }, { ...marksIn(t, from, from), ...NO_LINE })
	})
	if (body) editor.select({ story: body, anchor: 0, head: 0 })
}

/** Esc in a footnote body: caret back after its ref. */
export function leaveFootnote({ doc, editor }: CommandCtx): boolean {
	const ref = footnoteRef(doc, editor.sel?.story)
	if (!ref) return false
	editor.select({ story: ref.story, anchor: ref.offset + 1, head: ref.offset + 1 })
	return true
}

/**
 * Insert a table of contents (headings of `tocLevel` 1..`levels`) as its own paragraph before
 * the caret's (split at the caret first). Section stories only, never inside a table.
 */
export function insertToc({ doc, editor }: CommandCtx, levels: number): void {
	if (!isSectionStory(doc, editor.sel?.story)) return
	editor.run((t, from, to) => {
		if (tableAt(t, from) || tableAt(t, to)) return
		deleteRange(t, from, to)
		const at = breakBefore(t, from)
		const ps = styleMap(doc).p ?? null
		t.applyDelta([
			{ retain: at },
			{ insert: { toc: { levels: Math.min(6, Math.max(1, levels)) } }, attributes: NO_LINE },
			{ insert: '\n', attributes: { ...NO_LINE, bid: newBlockId(), ps } }
		])
		return at + 2
	})
}

// vim: ts=4
