// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { jest } from '@jest/globals'
import { render, screen } from '@testing-library/react'
import * as React from 'react'

const useDroppable = jest.fn((_args: { disabled: boolean }) => ({ setNodeRef: () => {} }))

const dndKit = await import('@dnd-kit/core')

jest.unstable_mockModule('@dnd-kit/core', () => ({ ...dndKit, useDroppable }))

const { TreeDndContext } = await import('../components/TreeView/TreeView.js')
const { TreeItem } = await import('../components/TreeView/TreeItem.js')

type DndValue = React.ContextType<typeof TreeDndContext>

describe('TreeItem', () => {
	it('leaves aria-expanded off a leaf, even an expanded one', () => {
		render(<TreeItem id="leaf" label="Leaf" expanded />)

		expect(screen.getByRole('treeitem').hasAttribute('aria-expanded')).toBe(false)
	})

	it.each([
		[true, 'true'],
		[false, 'false']
	])('states aria-expanded on a parent with expanded=%s', (expanded, value) => {
		render(<TreeItem id="parent" label="Parent" hasChildren expanded={expanded} />)

		expect(screen.getByRole('treeitem').getAttribute('aria-expanded')).toBe(value)
	})

	it('indents the row by depth, from the host tree’s variables', () => {
		const { container } = render(<TreeItem id="deep" label="Deep" depth={3} />)
		const row = container.querySelector('.c-tree-item-row') as HTMLElement

		expect(row.getAttribute('style')).toContain(
			'calc(var(--c-tree-indent-base, 0px) + 3 * var(--c-tree-indent, 16px))'
		)
	})

	it.each([
		[true, false],
		[false, true]
	])('with isDroppable=%s, disabled is %s', (isDroppable, disabled) => {
		useDroppable.mockClear()
		render(
			<TreeDndContext.Provider
				value={{ activeId: null, overId: null } as unknown as DndValue}
			>
				<TreeItem id="row" label="Row" isDroppable={isDroppable} />
			</TreeDndContext.Provider>
		)

		expect(useDroppable.mock.lastCall?.[0].disabled).toBe(disabled)
	})
})

// vim: ts=4
