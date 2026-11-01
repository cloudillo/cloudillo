// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { neighbourMove } from '../utils/page-order.js'

const pages = [
	{ id: 'a', order: 1 },
	{ id: 'b', order: 2 },
	{ id: 'c', order: 3 }
]

describe('neighbourMove', () => {
	it('first page cannot move earlier, moves after the next page', () => {
		expect(neighbourMove(pages, 'a', 'earlier')).toBeNull()
		expect(neighbourMove(pages, 'a', 'later')).toEqual({ targetId: 'b', position: 'after' })
	})

	it('last page cannot move later, moves before the previous page', () => {
		expect(neighbourMove(pages, 'c', 'later')).toBeNull()
		expect(neighbourMove(pages, 'c', 'earlier')).toEqual({ targetId: 'b', position: 'before' })
	})

	it('middle page moves both ways', () => {
		expect(neighbourMove(pages, 'b', 'earlier')).toEqual({ targetId: 'a', position: 'before' })
		expect(neighbourMove(pages, 'b', 'later')).toEqual({ targetId: 'c', position: 'after' })
	})

	it('a single page has no neighbour', () => {
		const one = [{ id: 'a', order: 1 }]
		expect(neighbourMove(one, 'a', 'earlier')).toBeNull()
		expect(neighbourMove(one, 'a', 'later')).toBeNull()
	})

	it('sorts by order rather than trusting array order', () => {
		const unsorted = [
			{ id: 'c', order: 3 },
			{ id: 'a', order: 0.5 },
			{ id: 'b', order: 1.75 }
		]
		expect(neighbourMove(unsorted, 'b', 'earlier')).toEqual({
			targetId: 'a',
			position: 'before'
		})
		expect(neighbourMove(unsorted, 'b', 'later')).toEqual({ targetId: 'c', position: 'after' })
		expect(neighbourMove(unsorted, 'a', 'earlier')).toBeNull()
		expect(neighbourMove(unsorted, 'c', 'later')).toBeNull()
	})

	it('returns null for an unknown page', () => {
		expect(neighbourMove(pages, 'x', 'later')).toBeNull()
	})
})

// vim: ts=4
