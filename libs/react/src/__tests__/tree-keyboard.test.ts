// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { type TreeKeyItem, treeKeyAction } from '../components/TreeView/keyboard.js'

// 0 A (expanded)
// 1   A1 (collapsed parent)
// 2   A2 (leaf)
// 3 B (leaf)
const items: TreeKeyItem[] = [
	{ level: 1, expanded: true, hasChildren: true },
	{ level: 2, expanded: false, hasChildren: true },
	{ level: 2, expanded: false, hasChildren: false },
	{ level: 1, expanded: false, hasChildren: false }
]
const plain = { draggable: false }
const act = (key: string, index: number, opts = plain) => treeKeyAction(key, items, index, opts)

describe('treeKeyAction', () => {
	it('ArrowDown / ArrowUp walk the visible order and stop at the ends', () => {
		expect(act('ArrowDown', 0)).toEqual({ focus: 1 })
		expect(act('ArrowDown', 3)).toBeNull()
		expect(act('ArrowUp', 2)).toEqual({ focus: 1 })
		expect(act('ArrowUp', 0)).toBeNull()
	})

	it('Home / End go to the first / last item', () => {
		expect(act('Home', 2)).toEqual({ focus: 0 })
		expect(act('End', 1)).toEqual({ focus: 3 })
	})

	it('ArrowRight expands a collapsed parent', () => {
		expect(act('ArrowRight', 1)).toEqual({ toggle: true })
	})

	it('ArrowRight on an expanded parent goes to its first child', () => {
		expect(act('ArrowRight', 0)).toEqual({ focus: 1 })
	})

	it('ArrowRight on a leaf does nothing', () => {
		expect(act('ArrowRight', 2)).toBeNull()
		expect(act('ArrowRight', 3)).toBeNull()
	})

	it('ArrowRight on an expanded parent with no rendered children does nothing', () => {
		const lone: TreeKeyItem[] = [{ level: 1, expanded: true, hasChildren: true }]
		expect(treeKeyAction('ArrowRight', lone, 0, plain)).toBeNull()
	})

	it('ArrowLeft collapses an expanded item', () => {
		expect(act('ArrowLeft', 0)).toEqual({ toggle: true })
	})

	it('ArrowLeft otherwise goes to the parent', () => {
		expect(act('ArrowLeft', 2)).toEqual({ focus: 0 })
		expect(act('ArrowLeft', 1)).toEqual({ focus: 0 })
	})

	it('ArrowLeft on a top-level item does nothing', () => {
		expect(act('ArrowLeft', 3)).toBeNull()
	})

	it('Enter selects, with or without draggable', () => {
		expect(act('Enter', 2)).toEqual({ select: true })
		expect(act('Enter', 2, { draggable: true })).toEqual({ select: true })
	})

	it('Space selects without draggable and is left to dnd-kit with it', () => {
		expect(act(' ', 2)).toEqual({ select: true })
		expect(act(' ', 2, { draggable: true })).toBeNull()
	})

	it('ignores other keys and a missing item', () => {
		expect(act('a', 0)).toBeNull()
		expect(act('ArrowDown', -1)).toBeNull()
		expect(treeKeyAction('ArrowDown', [], 0, plain)).toBeNull()
	})
})

// vim: ts=4
