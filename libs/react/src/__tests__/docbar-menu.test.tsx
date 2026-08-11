// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The DocBar overflow menu, driven by keyboard alone.
 *
 * The shared action affordance for all eight doc apps, so it must not regress to
 * mouse-only. If `Dropdown` renders its portal as a bare `.c-popper` div, every
 * `MenuItem`'s `role="menuitem"` is orphaned (an ARIA validity error, and no item
 * count announced) and arrow-key handling and focus entry disappear with it.
 */

import { fireEvent, render, screen } from '@testing-library/react'
import * as React from 'react'

import { DocBarMenu } from '../components/DocBar/DocBarMenu.js'
import { MenuDivider, MenuHeader, MenuItem } from '../components/Menu/index.js'

function renderMenu(onPick?: (label: string) => void) {
	const result = render(
		<DocBarMenu label="Actions">
			<MenuHeader>Document</MenuHeader>
			<MenuItem label="Import Markdown" onClick={() => onPick?.('Import Markdown')} />
			<MenuDivider />
			<MenuItem label="Document Settings" onClick={() => onPick?.('Document Settings')} />
			<MenuItem label="Export PDF" onClick={() => onPick?.('Export PDF')} />
		</DocBarMenu>
	)
	const trigger = screen.getByLabelText('Actions')
	return { ...result, trigger }
}

/** Open the menu the way Enter on the trigger does in a browser. */
function open(trigger: HTMLElement) {
	trigger.focus()
	fireEvent.click(trigger)
	return screen.getByRole('menu')
}

describe('DocBarMenu keyboard access', () => {
	it('gives the popper menu semantics its items can belong to', () => {
		const { trigger } = renderMenu()
		const menu = open(trigger)

		expect(menu.getAttribute('aria-label')).toBe('Actions')
		// The item count a screen reader announces comes from these being inside
		// the menu rather than orphaned in a bare div.
		expect(screen.getAllByRole('menuitem').map((el) => el.textContent)).toEqual([
			'Import Markdown',
			'Document Settings',
			'Export PDF'
		])
	})

	it('moves focus to the first item on open', () => {
		const { trigger } = renderMenu()
		open(trigger)

		expect(document.activeElement?.textContent).toBe('Import Markdown')
	})

	it('cycles with Up and Down and jumps with Home and End', () => {
		const { trigger } = renderMenu()
		const menu = open(trigger)

		fireEvent.keyDown(menu, { key: 'ArrowDown' })
		expect(document.activeElement?.textContent).toBe('Document Settings')

		fireEvent.keyDown(menu, { key: 'End' })
		expect(document.activeElement?.textContent).toBe('Export PDF')

		// Past the last item wraps to the first, and back again
		fireEvent.keyDown(menu, { key: 'ArrowDown' })
		expect(document.activeElement?.textContent).toBe('Import Markdown')
		fireEvent.keyDown(menu, { key: 'ArrowUp' })
		expect(document.activeElement?.textContent).toBe('Export PDF')

		fireEvent.keyDown(menu, { key: 'Home' })
		expect(document.activeElement?.textContent).toBe('Import Markdown')
	})

	// A divider is not an item — arrowing must not land on it.
	it('skips the divider', () => {
		const { trigger } = renderMenu()
		const menu = open(trigger)

		fireEvent.keyDown(menu, { key: 'ArrowDown' })

		expect(document.activeElement?.getAttribute('role')).toBe('menuitem')
	})

	it('activates the focused item with Enter, and hands focus back to the trigger', () => {
		const picked: string[] = []
		const { trigger } = renderMenu((label) => picked.push(label))
		const menu = open(trigger)

		fireEvent.keyDown(menu, { key: 'ArrowDown' })
		// A `<button>` turns Enter into a click; jsdom does not, so click the
		// element the roving focus landed on.
		fireEvent.click(document.activeElement as HTMLElement)

		expect(picked).toEqual(['Document Settings'])
		expect(screen.queryByRole('menu')).toBeNull()
		// The item the focus was on is unmounted; without this it falls to <body>
		// and a keyboard user loses their place in the bar entirely.
		expect(document.activeElement).toBe(trigger)
	})

	/**
	 * `role="menu"` admits only menu-ish children, so a bare `<div>` header or
	 * divider is the same `aria-required-children` violation the orphaned
	 * `role="menuitem"` was — fixed in the components rather than at each call site.
	 */
	it('gives the header and the divider roles a menu may contain', () => {
		const { trigger } = renderMenu()
		const menu = open(trigger)

		expect(menu.querySelector('.c-menu-header')?.getAttribute('role')).toBe('presentation')
		expect(menu.querySelector('.c-menu-divider')?.getAttribute('role')).toBe('separator')
	})

	it('closes on Escape and puts focus back on the trigger', () => {
		const { trigger } = renderMenu()
		open(trigger)

		fireEvent.keyDown(document, { key: 'Escape' })

		expect(screen.queryByRole('menu')).toBeNull()
		expect(document.activeElement).toBe(trigger)
	})
})

// vim: ts=4
