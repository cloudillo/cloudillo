// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { ExternalHyperlink, Packer } from 'docx'

import { type DeltaOp, deltaToBlocks, deltaToDocx } from '../export/docx.js'

const th = (row: string, cell: string) => ({
	'table-th': { 'data-row': row },
	'table-th-block': cell
})
const td = (row: string, cell: string) => ({
	'table-cell': { 'data-row': row },
	'table-cell-block': cell
})

const sample: DeltaOp[] = [
	{ insert: 'Title' },
	{ insert: '\n', attributes: { header: 1, bid: 'b1' } },
	{ insert: 'Plain ' },
	{ insert: 'bold', attributes: { bold: true } },
	{ insert: ' and ' },
	{ insert: 'a link', attributes: { link: 'https://example.org', underline: true } },
	{ insert: '\n' },
	{ insert: 'one' },
	{ insert: '\n', attributes: { list: 'ordered' } },
	{ insert: 'two' },
	{ insert: '\n', attributes: { list: 'ordered', indent: 1 } },
	{ insert: 'dot' },
	{ insert: '\n', attributes: { list: 'bullet' } },
	{ insert: '\n', attributes: { 'table-col': { width: '100' } } },
	{ insert: 'H1' },
	{ insert: '\n', attributes: th('row-a', 'cell-1') },
	{ insert: 'H2' },
	{ insert: '\n', attributes: th('row-a', 'cell-2') },
	{ insert: 'A1' },
	{ insert: '\n', attributes: td('row-b', 'cell-3') },
	{ insert: 'A1 second line' },
	{ insert: '\n', attributes: td('row-b', 'cell-3') },
	{ insert: 'A2' },
	{ insert: '\n', attributes: td('row-b', 'cell-4') },
	{ insert: { 'cl-image': { fileId: 'f1', alt: 'pic' } } },
	{ insert: 'After\n' }
]

describe('deltaToBlocks', () => {
	const blocks = deltaToBlocks(sample)

	it('maps a heading line', () => {
		expect(blocks[0]).toEqual({ type: 'line', header: 1, runs: [{ text: 'Title' }] })
	})

	it('maps inline formats and links', () => {
		expect(blocks[1]).toEqual({
			type: 'line',
			runs: [
				{ text: 'Plain ' },
				{ text: 'bold', bold: true },
				{ text: ' and ' },
				{ text: 'a link', link: 'https://example.org', underline: true }
			]
		})
	})

	it('maps ordered and bullet lists with indent', () => {
		expect(blocks.slice(2, 5)).toEqual([
			{ type: 'line', list: 'ordered', runs: [{ text: 'one' }] },
			{ type: 'line', list: 'ordered', indent: 1, runs: [{ text: 'two' }] },
			{ type: 'line', list: 'bullet', runs: [{ text: 'dot' }] }
		])
	})

	it('groups table lines into rows and cells', () => {
		const table = blocks[5]
		if (table.type !== 'table') throw new Error(`expected a table, got ${table.type}`)
		expect(table.rows.map((r) => r.header)).toEqual([true, false])
		expect(
			table.rows.map((r) => r.cells.map((c) => c.lines.map((l) => l.runs[0]?.text)))
		).toEqual([
			[['H1'], ['H2']],
			[['A1', 'A1 second line'], ['A2']]
		])
	})

	it('maps images and the lines after a table', () => {
		expect(blocks.slice(6)).toEqual([
			{ type: 'image', fileId: 'f1', alt: 'pic', width: undefined },
			{ type: 'line', runs: [{ text: 'After' }] }
		])
	})

	it('keeps text before an inline image ahead of it', () => {
		const ops: DeltaOp[] = [
			{ insert: 'Hello ' },
			{ insert: { 'cl-image': { fileId: 'f1' } } },
			{ insert: ' world\n' }
		]
		expect(deltaToBlocks(ops)).toEqual([
			{ type: 'line', runs: [{ text: 'Hello ' }] },
			{ type: 'image', fileId: 'f1', alt: undefined, width: undefined },
			{ type: 'line', runs: [{ text: ' world' }] }
		])
	})
})

describe('deltaToDocx', () => {
	it('packs into a DOCX (zip) and asks the loader for each image', async () => {
		const requested: string[] = []
		const loadImage = async (img: { fileId: string }) => {
			requested.push(img.fileId)
			return null
		}
		const buf = await Packer.toBuffer(await deltaToDocx(sample, loadImage))
		expect(buf.subarray(0, 2).toString()).toBe('PK')
		expect(requested).toEqual(['f1'])
	})

	it('emits no hyperlink for an unsafe link', async () => {
		const ops: DeltaOp[] = [
			{ insert: 'click', attributes: { link: 'javascript:alert(1)' } },
			{ insert: '\n' }
		]
		// Walk the document tree before packing (the packed XML is deflated)
		const seen = new Set<unknown>()
		const found: unknown[] = []
		const walk = (v: unknown) => {
			if (typeof v === 'string' && v.includes('javascript:')) found.push(v)
			if (!v || typeof v !== 'object' || seen.has(v)) return
			seen.add(v)
			if (v instanceof ExternalHyperlink) found.push(v)
			for (const c of Object.values(v)) walk(c)
		}
		walk(await deltaToDocx(ops))
		expect(found).toEqual([])
	})

	// The `instance` of each ordered paragraph, in document order
	async function orderedInstances(ops: DeltaOp[]) {
		const seen = new Set<unknown>()
		const found: number[] = []
		const walk = (v: unknown) => {
			if (!v || typeof v !== 'object' || seen.has(v)) return
			seen.add(v)
			const o = v as { reference?: unknown; instance?: unknown }
			if (o.reference === 'ordered' && typeof o.instance === 'number') found.push(o.instance)
			for (const c of Object.values(v)) walk(c)
		}
		walk(await deltaToDocx(ops))
		return found
	}

	it('keeps an ordered list going across a nested bullet', async () => {
		const ops: DeltaOp[] = [
			{ insert: 'one' },
			{ insert: '\n', attributes: { list: 'ordered' } },
			{ insert: 'dot' },
			{ insert: '\n', attributes: { list: 'bullet', indent: 1 } },
			{ insert: 'two' },
			{ insert: '\n', attributes: { list: 'ordered' } }
		]
		const instances = await orderedInstances(ops)
		expect(instances).toHaveLength(2)
		expect(instances[0]).toBe(instances[1])
	})

	it('numbers a list in a table cell apart from the outer list', async () => {
		const ops: DeltaOp[] = [
			{ insert: 'one' },
			{ insert: '\n', attributes: { list: 'ordered' } },
			{ insert: '\n', attributes: { 'table-col': { width: '100' } } },
			{ insert: 'cell' },
			{ insert: '\n', attributes: { ...td('row-a', 'cell-1'), list: 'ordered' } }
		]
		const instances = await orderedInstances(ops)
		expect(instances).toHaveLength(2)
		expect(instances[0]).not.toBe(instances[1])
	})
})

// vim: ts=4
