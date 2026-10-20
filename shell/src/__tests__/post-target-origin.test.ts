// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The `targetOrigin` the shell posts to an app frame with. A trusted frame has a real origin,
 * so it is named: a frame navigated elsewhere (by an escaped untrusted app) then never receives
 * a renewed token. An opaque (untrusted) frame has no origin to name and stays `'*'`.
 */

import { resetAppTracker } from '../message-bus/app-tracker.js'
import { ShellMessageBus } from '../message-bus/shell-bus.js'

function fakeWindow() {
	const posts: { message: unknown; target: string }[] = []
	const win = {
		postMessage: (message: unknown, target: string) => {
			posts.push({ message, target })
		}
	} as unknown as Window
	return { win, posts }
}

const config = {
	getAccessToken: async () => undefined,
	getAuthState: () => null,
	getThemeState: () => ({ darkMode: false, neutral: 'lch(35 8 250)' }),
	getLanguage: () => 'en'
}

describe('sendToApp target origin', () => {
	beforeEach(() => resetAppTracker())

	it('posts to a trusted connection with its origin', () => {
		const bus = new ShellMessageBus(config)
		const { win, posts } = fakeWindow()
		bus.preRegisterApp(win, { appName: 'quillo', origin: 'https://cl-o.alice.org' })
		bus.sendNotify(win, 'theme:update', { darkMode: true })
		expect(posts.map((p) => p.target)).toEqual(['https://cl-o.alice.org'])
	})

	it("posts to an untrusted connection with '*'", () => {
		const bus = new ShellMessageBus(config)
		const { win, posts } = fakeWindow()
		bus.preRegisterApp(win, { appName: 'thirdparty' })
		bus.sendNotify(win, 'theme:update', { darkMode: true })
		expect(posts.map((p) => p.target)).toEqual(['*'])
	})
})

describe('broadcastThemeUpdate', () => {
	beforeEach(() => resetAppTracker())

	it('sends only the picked theme fields', () => {
		const bus = new ShellMessageBus({
			...config,
			getThemeState: () => ({ darkMode: false, neutral: 'lch(35 8 250)', extra: 1 })
		})
		const { win, posts } = fakeWindow()
		bus.preRegisterApp(win, { appName: 'thirdparty' })
		bus.getAppTracker().markInitialized(win)
		bus.broadcastThemeUpdate()
		expect(posts).toHaveLength(1)
		expect((posts[0].message as { payload: unknown }).payload).toEqual({
			darkMode: false,
			neutral: 'lch(35 8 250)'
		})
	})
})

// vim: ts=4
