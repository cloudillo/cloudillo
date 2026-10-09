// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import Delta from 'quill-delta'

import { computeBlockIdFixes, newBlockId, stripBlockIds } from '../block-ids.js'

function idGen() {
	let n = 0
	return () => `new${n++}`
}

/** Apply the fixes and return each line's bid in document order. */
function bidsAfterFix(doc: Delta): (string | undefined)[] {
	const fixed = doc.compose(computeBlockIdFixes(doc, idGen()))
	const bids: (string | undefined)[] = []
	fixed.eachLine((_line, attrs) => {
		bids.push(attrs.bid as string | undefined)
	})
	return bids
}

const dummyNode = null as unknown as Node

describe('computeBlockIdFixes', () => {
	// Block embeds carry no '\n': their length must not make the next line look non-empty
	it('an empty line after a block embed counts as empty', () => {
		const doc = new Delta()
			.insert({ 'cl-document': 'x' })
			.insert('\n', { bid: 'x' })
			.insert('Title')
			.insert('\n', { bid: 'x' })
		const fixed = doc.compose(computeBlockIdFixes(doc, idGen()))
		expect(fixed.ops).toEqual([
			{ insert: { 'cl-document': 'x' } },
			{ insert: '\n', attributes: { bid: 'new0' } },
			{ insert: 'Title' },
			{ insert: '\n', attributes: { bid: 'x' } }
		])
	})

	it('gives every line an id (legacy document)', () => {
		const doc = new Delta().insert('a\nb\n').insert('c').insert('\n', { header: 1 })
		expect(bidsAfterFix(doc)).toEqual(['new0', 'new1', 'new2'])
	})

	it('is a no-op on a well-formed document', () => {
		const doc = new Delta()
			.insert('a')
			.insert('\n', { bid: 'x' })
			.insert('b')
			.insert('\n', { bid: 'y' })
		expect(computeBlockIdFixes(doc, idGen()).ops).toEqual([])
	})

	it('split: the first half keeps the id, the second gets a new one', () => {
		const doc = new Delta()
			.insert('he')
			.insert('\n', { bid: 'x', header: 2 })
			.insert('llo')
			.insert('\n', { bid: 'x', header: 2 })
		expect(bidsAfterFix(doc)).toEqual(['x', 'new0'])
	})

	it('split at the very start: the non-empty (heading) line keeps the id', () => {
		const doc = new Delta()
			.insert('\n', { bid: 'x', header: 2 })
			.insert('Title')
			.insert('\n', { bid: 'x', header: 2 })
		expect(bidsAfterFix(doc)).toEqual(['new0', 'x'])
	})

	it('all-empty duplicates: the first occurrence keeps the id', () => {
		const doc = new Delta().insert('\n', { bid: 'x' }).insert('\n', { bid: 'x' })
		expect(bidsAfterFix(doc)).toEqual(['x', 'new0'])
	})

	it('merge keeps the first line id', () => {
		const doc = new Delta().insert('hello').insert('\n', { bid: 'x' })
		expect(bidsAfterFix(doc)).toEqual(['x'])
	})

	it('duplicates: first occurrence in document order wins', () => {
		const doc = new Delta()
			.insert('a\n', { bid: 'x' })
			.insert('b')
			.insert('\n', { bid: 'y' })
			.insert('c')
			.insert('\n', { bid: 'x' })
		expect(bidsAfterFix(doc)).toEqual(['x', 'y', 'new0'])
	})

	it('keeps offsets right across embeds and other line formats', () => {
		const doc = new Delta()
			.insert('a')
			.insert({ image: 'x.png' })
			.insert('b')
			.insert('\n', { list: 'bullet' })
			.insert('c')
			.insert('\n', { bid: 'y', align: 'center' })
		const fixed = doc.compose(computeBlockIdFixes(doc, idGen()))
		expect(fixed.ops).toEqual([
			{ insert: 'a' },
			{ insert: { image: 'x.png' } },
			{ insert: 'b' },
			{ insert: '\n', attributes: { list: 'bullet', bid: 'new0' } },
			{ insert: 'c' },
			{ insert: '\n', attributes: { bid: 'y', align: 'center' } }
		])
	})

	it('never hands out an id that already exists later in the document', () => {
		const ids = ['taken', 'fresh']
		const doc = new Delta().insert('a\n').insert('b').insert('\n', { bid: 'taken' })
		const fixed = doc.compose(computeBlockIdFixes(doc, () => ids.shift() ?? 'zzz'))
		const bids: unknown[] = []
		fixed.eachLine((_l, attrs) => {
			bids.push(attrs.bid)
		})
		expect(bids).toEqual(['fresh', 'taken'])
	})
})

describe('stripBlockIds', () => {
	it('removes bid and keeps other attributes', () => {
		const delta = new Delta()
			.insert('a')
			.insert('\n', { bid: 'x', header: 1 })
			.insert('b')
			.insert('\n', { bid: 'y' })
		stripBlockIds(dummyNode, delta)
		expect(delta.ops).toEqual([
			{ insert: 'a' },
			{ insert: '\n', attributes: { header: 1 } },
			{ insert: 'b' },
			{ insert: '\n' }
		])
	})
})

describe('newBlockId', () => {
	it('is 8 base36 chars', () => {
		for (let i = 0; i < 50; i++) expect(newBlockId()).toMatch(/^[0-9a-z]{8}$/)
	})
})
