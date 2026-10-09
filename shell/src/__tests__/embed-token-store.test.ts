// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { getAppTracker, resetAppTracker } from '../message-bus/app-tracker.js'

const entry = (token: string, access: 'read' | 'write') => ({
	fileId: 'f2',
	token,
	access,
	ancestors: ['f1']
})

describe('the embed token store', () => {
	beforeEach(() => resetAppTracker())
	afterEach(() => resetAppTracker())

	// Keyed per instance: a read embed next to a write one of the same file stays read
	it('keeps each instance of the same file at its own access', () => {
		const tracker = getAppTracker()
		const win = {} as Window
		tracker.storeEmbedToken(win, '_embed:n1', entry('w', 'write'))
		tracker.storeEmbedToken(win, '_embed:n2', entry('r', 'read'))

		expect(tracker.getEmbedToken(win, '_embed:n1')?.access).toBe('write')
		expect(tracker.getEmbedToken(win, '_embed:n2')).toEqual(entry('r', 'read'))
	})

	it('answers hasEmbed by fileId', () => {
		const tracker = getAppTracker()
		const win = {} as Window
		tracker.storeEmbedToken(win, '_embed:n1', entry('t', 'read'))

		expect(tracker.hasEmbed(win, 'f2')).toBe(true)
		expect(tracker.hasEmbed(win, 'f3')).toBe(false)
		expect(tracker.hasEmbed({} as Window, 'f2')).toBe(false)
	})

	it('forgets a removed embed', () => {
		const tracker = getAppTracker()
		const win = {} as Window
		tracker.storeEmbedToken(win, '_embed:n1', entry('t', 'read'))

		tracker.removeEmbedToken(win, '_embed:n1')

		expect(tracker.hasEmbed(win, 'f2')).toBe(false)
	})

	it('answers hasEmbed only for the direct parent when one is given', () => {
		const tracker = getAppTracker()
		const win = {} as Window
		tracker.storeEmbedToken(win, '_embed:n1', {
			...entry('t', 'read'),
			ancestors: ['f1', 'f2']
		})

		expect(tracker.hasEmbed(win, 'f2', 'f1')).toBe(false)
		expect(tracker.hasEmbed(win, 'f2', 'f2')).toBe(true)
	})

	it('drops tokens when the same window registers again', () => {
		const tracker = getAppTracker()
		const win = {} as Window
		tracker.storeEmbedToken(win, '_embed:n1', entry('t', 'read'))

		tracker.registerApp({ resId: 'h:f1', window: win })

		expect(tracker.getEmbedToken(win, '_embed:n1')).toBeUndefined()
	})

	it("a second window on the same resId keeps the first window's tokens", () => {
		const tracker = getAppTracker()
		const win = {} as Window
		tracker.registerApp({ resId: 'h:f1', window: win })
		tracker.storeEmbedToken(win, '_embed:n1', entry('t', 'read'))

		tracker.registerApp({ resId: 'h:f1', window: {} as Window })

		expect(tracker.getEmbedToken(win, '_embed:n1')).toBeDefined()
	})
})

// vim: ts=4
