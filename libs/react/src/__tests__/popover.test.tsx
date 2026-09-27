// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { jest } from '@jest/globals'
import { act, fireEvent, render, screen } from '@testing-library/react'
import * as React from 'react'

import { Popover } from '../components/Popover/index.js'
import { trustedClick } from './helpers.js'

function renderPopover(props: Partial<React.ComponentProps<typeof Popover>> = {}) {
	render(
		<>
			<button type="button">Outside</button>
			<Popover trigger={<button type="button">Open</button>} {...props}>
				Content
			</Popover>
		</>
	)
	return screen.getByText('Open')
}

describe('Popover', () => {
	it('opens on trigger click, wires aria and focuses the surface', () => {
		const trigger = renderPopover()
		expect(trigger.getAttribute('aria-expanded')).toBe('false')
		fireEvent.click(trigger)
		const surface = screen.getByRole('dialog')
		expect(trigger.getAttribute('aria-expanded')).toBe('true')
		expect(trigger.getAttribute('aria-controls')).toBe(surface.id)
		expect(document.activeElement).toBe(surface)
	})

	it('closes on Escape and returns focus to the trigger', () => {
		const trigger = renderPopover()
		fireEvent.click(trigger)
		fireEvent.keyDown(document.activeElement ?? document, { key: 'Escape' })
		expect(screen.queryByRole('dialog')).toBeNull()
		expect(trigger.getAttribute('aria-expanded')).toBe('false')
		expect(document.activeElement).toBe(trigger)
	})

	it('closes on an outside click', () => {
		renderPopover()
		fireEvent.click(screen.getByText('Open'))
		act(() => trustedClick(screen.getByText('Outside')))
		expect(screen.queryByRole('dialog')).toBeNull()
	})

	it('reports Escape through onOpenChange when controlled', () => {
		const onOpenChange = jest.fn()
		renderPopover({ open: true, onOpenChange })
		fireEvent.keyDown(document, { key: 'Escape' })
		expect(onOpenChange).toHaveBeenCalledWith(false)
		// Controlled: stays open until the owner says otherwise
		expect(screen.getByRole('dialog')).toBeTruthy()
	})
})

// vim: ts=4
