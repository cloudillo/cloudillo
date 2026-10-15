// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { Run, TableBlock } from '@cloudillo/typeset'
import * as Y from 'yjs'

import { openPublication } from '../crdt/document.js'
import { newSectionMap } from '../crdt/entities.js'
import type { StoredSection } from '../crdt/stored-types.js'
import { type DeltaOp, deltaToParagraphs } from '../crdt/type-converters.js'
import { pasteDelta } from '../editor/clipboard.js'
import {
	type CommandCtx,
	footnoteRef,
	insertFootnote,
	insertTable,
	insertToc,
	leaveFootnote,
	leaveTable,
	setTableBorders,
	tableAt,
	tableCellMove,
	tableDeleteCol,
	tableDeleteRow,
	tableInsertCol,
	tableInsertRow,
	toggleHeaderRow
} from '../editor/commands.js'
import { deleteRange, insertText } from '../editor/text-edit.js'
import type { Editor } from '../editor/useEditor.js'

/** A one-section publication with story `S` = `text`, the caret at `caret`. */
function setup(text: string, caret: number) {
	const yDoc = new Y.Doc()
	const doc = openPublication(yDoc)
	const t = new Y.Text()
	doc.tx.set('S', t)
	t.insert(0, text, { bid: 'A' })
	doc.s.set('s1', newSectionMap({ story: 'S' } as StoredSection))
	doc.secs.push(['s1'])
	const editor = {
		sel: { story: 'S', anchor: caret, head: caret },
		select(s: { story: string; anchor: number; head: number }) {
			editor.sel = s
		},
		run(fn: (t: Y.Text, from: number, to: number) => number | undefined) {
			const s = editor.sel
			let r: number | undefined
			yDoc.transact(() => {
				r = fn(t, Math.min(s.anchor, s.head), Math.max(s.anchor, s.head))
			})
			if (r !== undefined) editor.sel = { story: 'S', anchor: r, head: r }
			return true
		}
	}
	const ctx = { yDoc, doc, editor: editor as unknown as Editor } as CommandCtx
	const paras = () => deltaToParagraphs(t.toDelta() as DeltaOp[])
	const text0 = (i: number) => (paras()[i].runs as Run[]).map((r) => r.text).join('')
	return { t, ctx, editor, paras, text0 }
}

const cellCounts = (t: Y.Text, off: number) => tableAt(t, off)?.rows.map((r) => r.cells.length)

describe('table commands', () => {
	it('insertTable mid-paragraph keeps the text before and after the caret', () => {
		const { t, ctx, editor, paras, text0 } = setup('Hello world\n', 5)
		insertTable(ctx, 2, 2)
		const ps = paras()
		expect(ps).toHaveLength(3)
		expect(text0(0)).toBe('Hello')
		expect((ps[1].runs as TableBlock).k).toBe('table')
		expect(text0(2)).toBe(' world')
		// The caret lands in the first cell.
		const tb = tableAt(t, editor.sel.head)
		expect(tb?.row).toBe(0)
		expect(tb?.col).toBe(0)
		expect(cellCounts(t, editor.sel.head)).toEqual([2, 2])
	})

	it('inserts and deletes rows and columns', () => {
		const { t, ctx, editor } = setup('x\n', 0)
		insertTable(ctx, 2, 2)
		tableInsertRow(ctx, true)
		expect(cellCounts(t, editor.sel.head)).toEqual([2, 2, 2])
		// The caret moves into the new row.
		expect(tableAt(t, editor.sel.head)?.row).toBe(1)
		tableInsertCol(ctx, true)
		expect(cellCounts(t, editor.sel.head)).toEqual([3, 3, 3])
		expect(tableAt(t, editor.sel.head)?.col).toBe(1)
		tableDeleteRow(ctx)
		expect(cellCounts(t, editor.sel.head)).toEqual([3, 3])
		tableDeleteCol(ctx)
		expect(cellCounts(t, editor.sel.head)).toEqual([2, 2])
		const tb = tableAt(t, editor.sel.head)
		expect(tb?.row).toBe(1)
		expect(tb?.col).toBe(0)
		expect(editor.sel.head).toBe(tb?.rows[1].cells[0].start)
	})

	it('deleting the last column moves the caret to the previous cell', () => {
		const { t, ctx, editor } = setup('x\n', 0)
		insertTable(ctx, 3, 2)
		const at = tableAt(t, editor.sel.head)?.rows[1].cells[2].start ?? -1
		editor.sel = { story: 'S', anchor: at, head: at }
		tableDeleteCol(ctx)
		const tb = tableAt(t, editor.sel.head)
		expect(cellCounts(t, editor.sel.head)).toEqual([2, 2])
		expect(tb?.row).toBe(1)
		expect(tb?.col).toBe(1)
		expect(editor.sel.head).toBe(tb?.rows[1].cells[1].start)
	})

	describe('with a colspan', () => {
		/** Row 1: a (colspan 2), b; row 2: c, d, e. The caret is in `c`. */
		function spanned() {
			const r = setup('x\n', 0)
			const cell = (row: string, id: string, colspan?: string) => ({
				insert: '\n',
				attributes: {
					'table-cell': colspan ? { 'data-row': row, colspan } : { 'data-row': row },
					'table-cell-block': id
				}
			})
			r.t.applyDelta([
				{ insert: '\n', attributes: { 'table-temporary': {} } },
				{ insert: 'a' },
				cell('r1', 'c1', '2'),
				{ insert: 'b' },
				cell('r1', 'c2'),
				...['c', 'd', 'e'].flatMap((x) => [{ insert: x }, cell('r2', `c${x}`)])
			])
			r.editor.sel = { story: 'S', anchor: 5, head: 5 }
			return r
		}
		const spans = (t: Y.Text, off: number) =>
			tableAt(t, off)?.rows.map((r) => r.cells.map((c) => c.span))

		it('counts grid columns', () => {
			const { t, ctx, editor } = spanned()
			expect(tableAt(t, 1)?.col).toBe(0)
			expect(tableAt(t, 3)?.col).toBe(2)
			tableInsertRow(ctx, true)
			expect(cellCounts(t, editor.sel.head)).toEqual([2, 3, 3])
		})

		it('inserting a column inside a span grows it', () => {
			const { t, ctx, editor } = spanned()
			tableInsertCol(ctx, true)
			expect(spans(t, editor.sel.head)).toEqual([
				[3, 1],
				[1, 1, 1, 1]
			])
			const tb = tableAt(t, editor.sel.head)
			expect(tb?.row).toBe(1)
			expect(tb?.col).toBe(1)
			expect(editor.sel.head).toBe(tb?.rows[1].cells[1].start)
		})

		it('deleting a column under a span shrinks it', () => {
			const { t, ctx, editor } = spanned()
			tableDeleteCol(ctx)
			expect(spans(t, editor.sel.head)).toEqual([
				[1, 1],
				[1, 1]
			])
			expect(t.toString().slice(0, 9)).toBe('\na\nb\nd\ne\n')
			const tb = tableAt(t, editor.sel.head)
			expect(editor.sel.head).toBe(tb?.rows[1].cells[0].start)
		})
	})

	it('toggleHeaderRow flips the first row, cell ids kept', () => {
		const { t, ctx, editor } = setup('x\n', 0)
		insertTable(ctx, 2, 2)
		const ids = () => tableAt(t, editor.sel.head)?.rows.map((r) => r.cells.map((c) => c.id))
		const before = ids()
		expect(tableAt(t, editor.sel.head)?.rows[0].th).toBe(true)
		toggleHeaderRow(ctx)
		expect(tableAt(t, editor.sel.head)?.rows[0].th).toBe(false)
		toggleHeaderRow(ctx)
		expect(tableAt(t, editor.sel.head)?.rows[0].th).toBe(true)
		expect(ids()).toEqual(before)
	})

	it('setTableBorders stores the choice on the table line', () => {
		const { t, ctx, editor } = setup('x\n', 0)
		insertTable(ctx, 2, 1)
		const borders = () => tableAt(t, editor.sel.head)?.temp?.attrs['table-temporary']
		setTableBorders(ctx, 'none')
		expect(borders()?.['data-borders']).toBe('none')
		setTableBorders(ctx, 'all')
		expect(borders()?.['data-borders']).toBeUndefined()
	})

	it('setTableBorders adds a missing table line, the caret shifted past it', () => {
		const { t, ctx, editor } = setup('x\n', 2)
		const cell = (id: string) => ({
			insert: '\n',
			attributes: { 'table-cell': { 'data-row': 'r1' }, 'table-cell-block': id }
		})
		t.applyDelta([{ retain: 2 }, { insert: 'a' }, cell('c1'), { insert: 'b' }, cell('c2')])
		editor.sel = { story: 'S', anchor: 4, head: 4 }
		expect(tableAt(t, 4)?.temp).toBeUndefined()
		setTableBorders(ctx, 'none')
		expect(editor.sel.head).toBe(5)
		expect(tableAt(t, 5)?.temp?.attrs['table-temporary']?.['data-borders']).toBe('none')
	})

	it('tableCellMove selects the next cell, appends a row from the last', () => {
		const { t, ctx, editor } = setup('x\n', 0)
		insertTable(ctx, 2, 2)
		const cells = () => tableAt(t, editor.sel.head)?.rows.flatMap((r) => r.cells) ?? []
		const c2 = cells()[1]
		expect(tableCellMove(ctx, -1)).toBe(false)
		expect(tableCellMove(ctx, 1)).toBe(true)
		expect(editor.sel).toEqual({ story: 'S', anchor: c2.start, head: c2.end })
		const last = cells()[3]
		editor.sel = { story: 'S', anchor: last.start, head: last.start }
		expect(tableCellMove(ctx, 1)).toBe(true)
		expect(cellCounts(t, editor.sel.head)).toEqual([2, 2, 2])
	})

	it('leaveTable moves to the paragraph after the table', () => {
		const { t, ctx, editor } = setup('x\n', 0)
		insertTable(ctx, 2, 1)
		const end = tableAt(t, editor.sel.head)?.to
		expect(leaveTable(ctx)).toBe(true)
		expect(editor.sel.head).toBe(end)
		expect(t.toString().slice(end)).toBe('x\n')
	})

	it('leaveTable at the story end adds an empty paragraph', () => {
		const { t, ctx, editor } = setup('x\n', 2)
		insertTable(ctx, 2, 1)
		const end = tableAt(t, editor.sel.head)?.to ?? -1
		expect(end).toBe(t.length)
		expect(leaveTable(ctx)).toBe(true)
		expect(editor.sel.head).toBe(end)
		expect(t.length).toBe(end + 1)
		expect(tableAt(t, end)).toBeUndefined()
	})

	it('typing over a Tab-selected multi-paragraph cell replaces its text', () => {
		const { t, ctx, editor } = setup('x\n', 2)
		const cell = (id: string) => ({
			insert: '\n',
			attributes: { 'table-cell': { 'data-row': 'r1' }, 'table-cell-block': id }
		})
		t.applyDelta([
			{ retain: 2 },
			{ insert: '\n', attributes: { 'table-temporary': {} } },
			{ insert: 'a' },
			cell('c1'),
			{ insert: 'p' },
			cell('c2'),
			{ insert: 'q' },
			cell('c2')
		])
		editor.sel = { story: 'S', anchor: 4, head: 4 }
		expect(tableCellMove(ctx, 1)).toBe(true)
		editor.run((tx, from, to) => {
			deleteRange(tx, from, to)
			return insertText(tx, from, 'z')
		})
		const tb = tableAt(t, editor.sel.head)
		expect(cellCounts(t, editor.sel.head)).toEqual([2])
		const c2 = tb?.rows[0].cells[1]
		expect(c2 && t.toString().slice(c2.start, c2.end + 1)).toBe('z\n')
	})

	it('insertToc mid-paragraph keeps the text before the caret', () => {
		const { ctx, paras, text0 } = setup('Hello world\n', 5)
		insertToc(ctx, 3)
		const ps = paras()
		expect(text0(0)).toBe('Hello')
		expect(
			ps.some((p) => (p.runs as Run[])[0]?.embed && 'toc' in (p.runs as Run[])[0].embed!)
		).toBe(true)
		expect(text0(ps.length - 1)).toBe(' world')
	})
})

describe('pasteDelta of a table', () => {
	const table = (colspan?: string): DeltaOp[] => [
		{ insert: '\n', attributes: { 'table-temporary': {} } },
		{ insert: 'a' },
		{
			insert: '\n',
			attributes: {
				'table-cell': colspan ? { 'data-row': 'r1', colspan } : { 'data-row': 'r1' },
				'table-cell-block': 'c1'
			}
		},
		{ insert: 'b' },
		{
			insert: '\n',
			attributes: { 'table-cell': { 'data-row': 'r1' }, 'table-cell-block': 'c2' }
		}
	]

	it('mid-paragraph keeps the text before the caret', () => {
		const { t, ctx, paras, text0 } = setup('Hello world\n', 5)
		ctx.yDoc.transact(() => pasteDelta(ctx.doc, t, 5, table()))
		const ps = paras()
		expect(text0(0)).toBe('Hello')
		expect((ps[1].runs as TableBlock).k).toBe('table')
		expect(text0(ps.length - 1)).toBe(' world')
	})

	it('clamps a pasted colspan', () => {
		const { t, ctx } = setup('x\n', 0)
		ctx.yDoc.transact(() => pasteDelta(ctx.doc, t, 0, table('999')))
		const spans = (t.toDelta() as DeltaOp[]).flatMap((op) => {
			const c = op.attributes?.['table-cell'] as Record<string, unknown> | undefined
			return c?.colspan ? [c.colspan] : []
		})
		expect(spans).toEqual(['64'])
	})
})

describe('footnote commands', () => {
	it('insertFootnote adds a ref and its body, the caret in the body', () => {
		const { t, ctx, editor } = setup('Hello\n', 5)
		insertFootnote(ctx)
		const op = (t.toDelta() as DeltaOp[])[1]
		const body = (op?.insert as { fn?: string } | undefined)?.fn ?? ''
		expect(t.toString().indexOf('Hello')).toBe(0)
		expect(ctx.doc.tx.get(body)?.toString()).toBe('\n')
		expect(editor.sel).toEqual({ story: body, anchor: 0, head: 0 })
		expect(footnoteRef(ctx.doc, body)).toEqual({ story: 'S', offset: 5 })
		expect(footnoteRef(ctx.doc, 'S')).toBeUndefined()
		expect(leaveFootnote(ctx)).toBe(true)
		expect(editor.sel).toEqual({ story: 'S', anchor: 6, head: 6 })
	})

	it('insertFootnote is a no-op inside a table cell', () => {
		const { t, ctx, editor } = setup('x\n', 0)
		insertTable(ctx, 2, 1)
		const before = t.toString()
		const sel = editor.sel
		insertFootnote(ctx)
		expect(t.toString()).toBe(before)
		expect(editor.sel).toEqual(sel)
		expect([...ctx.doc.tx.keys()]).toEqual(['S'])
	})
})

describe('pasteDelta of a footnote ref', () => {
	const fnOf = (t: Y.Text) =>
		(t.toDelta() as DeltaOp[]).flatMap((op) => {
			const e = op.insert as { fn?: string }
			return typeof e === 'object' && e.fn ? [e.fn] : []
		})

	it('copies the body, and drops a ref to a missing one', () => {
		const { t, ctx } = setup('x\n', 0)
		ctx.doc.tx.set('n', new Y.Text('note\n'))
		ctx.doc.f.set(
			'n',
			new Y.Map<unknown>([
				['t', 'fn'],
				['story', 'n']
			])
		)
		ctx.yDoc.transact(() =>
			pasteDelta(ctx.doc, t, 0, [{ insert: { fn: 'n' } }, { insert: { fn: 'gone' } }])
		)
		const fns = fnOf(t)
		expect(fns).toHaveLength(1)
		expect(fns[0]).not.toBe('n')
		expect(ctx.doc.tx.get(fns[0])?.toString()).toBe('note\n')
	})
})

// vim: ts=4
