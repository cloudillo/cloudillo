// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import {
	detectExternalDisplay,
	formatElapsed,
	getExternalScreen,
	isSwipe,
	tapZone
} from '../presenter'

describe('formatElapsed', () => {
	it('formats m:ss and h:mm:ss', () => {
		expect(formatElapsed(0)).toBe('0:00')
		expect(formatElapsed(-5)).toBe('0:00')
		expect(formatElapsed(65_400)).toBe('1:05')
		expect(formatElapsed(3_599_999)).toBe('59:59')
		expect(formatElapsed(3_600_000)).toBe('1:00:00')
		expect(formatElapsed(3_725_000)).toBe('1:02:05')
	})
})

describe('tapZone', () => {
	it('splits halves for a fine pointer', () => {
		expect(tapZone(10, 300, false)).toBe('prev')
		expect(tapZone(160, 300, false)).toBe('next')
	})
	it('splits thirds on touch, middle toggles', () => {
		expect(tapZone(50, 300, true)).toBe('prev')
		expect(tapZone(150, 300, true)).toBe('toggle')
		expect(tapZone(250, 300, true)).toBe('next')
	})
})

describe('isSwipe', () => {
	it('navigates on a mostly horizontal drag over 50 px', () => {
		expect(isSwipe(-80, 10)).toBe('next')
		expect(isSwipe(80, -10)).toBe('prev')
	})
	it('ignores short, vertical or diagonal drags', () => {
		expect(isSwipe(40, 0)).toBeNull()
		expect(isSwipe(10, 120)).toBeNull()
		expect(isSwipe(80, 70)).toBeNull()
	})
})

describe('external display', () => {
	const w = window as unknown as Record<string, unknown>
	function setExtended(v: boolean) {
		Object.defineProperty(window.screen, 'isExtended', { value: v, configurable: true })
	}
	function setPermission(state: string) {
		Object.defineProperty(navigator, 'permissions', {
			value: { query: async () => ({ state }) },
			configurable: true
		})
	}
	afterEach(() => {
		delete w.getScreenDetails
		delete w.PresentationRequest
	})

	it('getExternalScreen does not prompt when permission is not granted', async () => {
		setExtended(true)
		setPermission('prompt')
		let calls = 0
		w.getScreenDetails = async () => {
			calls++
			return { screens: [], currentScreen: {} }
		}
		expect(await getExternalScreen()).toBeNull()
		expect(calls).toBe(0)
	})

	it('detectExternalDisplay ignores PresentationRequest when not extended', async () => {
		setExtended(false)
		w.PresentationRequest = class {
			getAvailability = async () => ({ value: true })
		}
		w.getScreenDetails = async () => ({ screens: [], currentScreen: {} })
		expect(await detectExternalDisplay()).toBe(false)
	})

	it('detectExternalDisplay is false when getScreenDetails rejects', async () => {
		setExtended(true)
		w.getScreenDetails = async () => {
			throw new Error('denied')
		}
		expect(await detectExternalDisplay()).toBe(false)
	})

	it('detectExternalDisplay is true when extended and permitted', async () => {
		setExtended(true)
		w.getScreenDetails = async () => ({ screens: [], currentScreen: {} })
		expect(await detectExternalDisplay()).toBe(true)
	})
})

// vim: ts=4
