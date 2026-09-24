// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * `Menu`'s outside-click dismissal — a capture-phase `click` on `document` that swallows
 * the dismissing click, so it does not also activate whatever sits behind the menu.
 *
 * Every `Menu` / `Dropdown` / context-menu consumer in the monorepo rides on this, hence
 * the test. jsdom cannot express the touch long-press path: `profile-context-menu.tsx`
 * opens the menu on a timer *during* the hold, and the browser then fires a trusted
 * compatibility `click` on `touchend` — which this handler would see as an outside click.
 * That one needs a manual check on a real touch device.
 */

import { jest } from '@jest/globals'
import { render, screen } from '@testing-library/react'
import * as React from 'react'

import { Menu, MenuItem } from '../components/Menu/index.js'

/**
 * What a real pointer produces: jsdom's constructed events are `isTrusted === false`, and
 * even `el.click()` is. The flag is a non-configurable own getter over the event's internal
 * impl object, so it cannot be redefined — it has to be flipped on the impl itself.
 */
function trustedClick(target: Element) {
	const evt = new MouseEvent('click', { bubbles: true, cancelable: true })
	// `dispatchEvent()` stamps isTrusted=false per spec, so the flag has to be flipped back
	// mid-flight: `window` is the first hop of the capture path, ahead of the `document`
	// listener under test.
	const forge = (e: Event) => {
		const implSym = Object.getOwnPropertySymbols(e).find((s) => String(s) === 'Symbol(impl)')
		if (!implSym) throw new Error('jsdom event impl not found')
		;(e as unknown as Record<symbol, { isTrusted: boolean }>)[implSym].isTrusted = true
	}
	window.addEventListener('click', forge, true)
	try {
		target.dispatchEvent(evt)
	} finally {
		window.removeEventListener('click', forge, true)
	}
}

function setup() {
	const onClose = jest.fn()
	const onSibling = jest.fn()
	render(
		<>
			<button type="button" onClick={onSibling}>
				Behind
			</button>
			<Menu position={{ x: 0, y: 0 }} onClose={onClose}>
				<MenuItem label="Rename" />
			</Menu>
		</>
	)
	return { onClose, onSibling, sibling: screen.getByText('Behind') }
}

describe('Menu outside click', () => {
	it('closes on a trusted outside click and swallows it', () => {
		const { onClose, onSibling, sibling } = setup()

		trustedClick(sibling)

		expect(onClose).toHaveBeenCalledTimes(1)
		expect(onSibling).not.toHaveBeenCalled()
	})

	it('ignores a synthetic click — a menu item doing its job', () => {
		const { onClose, sibling } = setup()

		sibling.dispatchEvent(new MouseEvent('click', { bubbles: true }))

		expect(onClose).not.toHaveBeenCalled()
	})

	it('stays open on a click inside the menu', () => {
		const { onClose } = setup()

		trustedClick(screen.getByRole('menu'))

		expect(onClose).not.toHaveBeenCalled()
	})
})

describe('Menu touch backdrop', () => {
	const originalMatchMedia = window.matchMedia
	function stubCoarse(matches: boolean) {
		window.matchMedia = ((query: string) =>
			({
				matches: matches && query === '(pointer: coarse)'
			}) as MediaQueryList) as typeof window.matchMedia
	}
	afterEach(() => {
		window.matchMedia = originalMatchMedia
	})

	it('closes on a backdrop tap without activating what is behind', () => {
		stubCoarse(true)
		const { onClose, onSibling } = setup()

		const backdrop = document.querySelector('.c-menu-backdrop')
		if (!backdrop) throw new Error('backdrop not rendered')
		trustedClick(backdrop)

		expect(onClose).toHaveBeenCalledTimes(1)
		expect(onSibling).not.toHaveBeenCalled()
	})

	it('renders no backdrop on a fine pointer', () => {
		stubCoarse(false)
		setup()

		expect(document.querySelector('.c-menu-backdrop')).toBeNull()
	})
})

// vim: ts=4
