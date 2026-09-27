// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * What a real pointer produces: jsdom's constructed events are `isTrusted === false`, and
 * even `el.click()` is. The flag is a non-configurable own getter over the event's internal
 * impl object, so it cannot be redefined — it has to be flipped on the impl itself.
 */
export function trustedClick(target: Element) {
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

// vim: ts=4
