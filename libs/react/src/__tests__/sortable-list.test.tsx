// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/** The keyboard Move-menu route only: jsdom has no layout for pointer drags. */

import { jest } from '@jest/globals'
import { fireEvent, render, screen } from '@testing-library/react'
import * as React from 'react'

import { SortableList } from '../components/SortableList/index.js'

const items = ['A', 'B', 'C']

function setup() {
	const onReorder = jest.fn()
	render(
		<SortableList
			items={items}
			getKey={(s) => s}
			getLabel={(s) => s}
			onReorder={onReorder}
			renderItem={(s, { handle }) => (
				<div>
					{handle}
					{s}
				</div>
			)}
		/>
	)
	return { onReorder }
}

function openMove(name: string) {
	fireEvent.click(screen.getByRole('button', { name: `Move ${name}` }))
}

// Button fires onClick after its ~200ms press animation, hence find*
async function menuItem(label: string) {
	return (await screen.findByRole('menuitem', { name: label })) as HTMLButtonElement
}

describe('SortableList Move menu', () => {
	it('moves an item up and announces it', async () => {
		const { onReorder } = setup()
		openMove('B')
		fireEvent.click(await menuItem('Move up'))
		expect(onReorder).toHaveBeenCalledWith(1, 0)
		// dnd-kit renders its own role=status region too
		expect(screen.getByText('B moved to position 1 of 3').getAttribute('role')).toBe('status')
	})

	it('disables Move up on the first item', async () => {
		setup()
		openMove('A')
		expect((await menuItem('Move up')).disabled).toBe(true)
	})

	it('disables Move down on the last item', async () => {
		setup()
		openMove('C')
		expect((await menuItem('Move down')).disabled).toBe(true)
	})
})

// vim: ts=4
