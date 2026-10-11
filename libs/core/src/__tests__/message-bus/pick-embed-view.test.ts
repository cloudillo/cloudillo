// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * `pickEmbedView`: '' = whole document, undefined = leave the embed unchanged. An older
 * shell ignores the preset `fileId` and browses instead; its answer must not reset the embed.
 *
 * Stubs are hand-rolled: the `jest` global is not injected under ESM.
 */

import { getAppBus, resetAppBus } from '../../message-bus/app-bus'

type Bus = ReturnType<typeof getAppBus>
type PickResult = Awaited<ReturnType<Bus['pickDocument']>>

describe('pickEmbedView', () => {
	let bus: Bus
	let calls: Parameters<Bus['pickDocument']>[]
	let logged: unknown[][]
	const realWarn = console.warn
	const realError = console.error
	const opts = { fileId: 'f2', contentType: 'cloudillo/quillo', sourceFileId: 'f1' }

	/** Make the stubbed picker answer `r`, or fail with `err` */
	function answer(r: Record<string, unknown> | undefined, err?: Error) {
		bus.pickDocument = async (...args) => {
			calls.push(args)
			if (err) throw err
			return r as PickResult
		}
	}

	beforeEach(() => {
		resetAppBus()
		bus = getAppBus()
		calls = []
		logged = []
		console.warn = (...args: unknown[]) => logged.push(args)
		console.error = (...args: unknown[]) => logged.push(args)
	})

	afterEach(() => {
		console.warn = realWarn
		console.error = realError
		resetAppBus()
	})

	it('resolves undefined on cancel', async () => {
		answer(undefined)
		expect(await bus.pickEmbedView(opts)).toBeUndefined()
	})

	it('resolves the nav picked for the same file', async () => {
		answer({ fileId: 'f2', nav: 'a' })
		expect(await bus.pickEmbedView(opts)).toBe('a')
	})

	it("resolves '' (whole document) when no nav was picked", async () => {
		answer({ fileId: 'f2' })
		expect(await bus.pickEmbedView(opts)).toBe('')
	})

	it('treats an answer for another file (older shell) as cancel', async () => {
		answer({ fileId: 'f9' })
		expect(await bus.pickEmbedView(opts)).toBeUndefined()
		expect(logged).toHaveLength(1)
	})

	it('matches an idTag-prefixed fileId against the bare result', async () => {
		answer({ fileId: 'f2', nav: 'b' })
		expect(await bus.pickEmbedView({ ...opts, fileId: 'home.example:f2' })).toBe('b')
	})

	it('resolves undefined when the picker fails', async () => {
		answer(undefined, new Error('refused'))
		expect(await bus.pickEmbedView(opts)).toBeUndefined()
		expect(logged).toHaveLength(1)
	})

	it('forwards an empty nav as undefined', async () => {
		answer(undefined)
		await bus.pickEmbedView({ ...opts, nav: '' })
		expect(calls[0][0]?.nav).toBeUndefined()
	})
})

// vim: ts=4
