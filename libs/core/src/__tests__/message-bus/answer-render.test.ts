// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * `onRenderRequest`: a request past its deadline is not rendered, and an answer that lands
 * after it is dropped (the host has already timed out).
 */

import { getAppBus, resetAppBus } from '../../message-bus/app-bus'
import type { EmbedRenderReqPayload } from '../../message-bus/types'

/** The private queue and send the test drives */
type Internals = {
	pendingRenderReqs: EmbedRenderReqPayload[]
	sendToShell: (m: { type: string }) => void
}

describe('onRenderRequest deadline', () => {
	let bus: ReturnType<typeof getAppBus>
	let sent: string[]
	let calls: number
	const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms))
	const req = (deadline: number): EmbedRenderReqPayload => ({ reqId: 'r1', deadline })

	beforeEach(() => {
		resetAppBus()
		bus = getAppBus()
		sent = []
		calls = 0
		;(bus as unknown as Internals).sendToShell = (m) => {
			sent.push(m.type)
		}
	})

	afterEach(() => resetAppBus())

	const queue = (r: EmbedRenderReqPayload) =>
		(bus as unknown as Internals).pendingRenderReqs.push(r)

	it('answers a request in time', async () => {
		queue(req(Date.now() + 1000))
		bus.onRenderRequest(async () => {
			calls++
			return { pages: [], natural: { w: 1, h: 1 } }
		})
		await tick()
		expect([calls, sent]).toEqual([1, ['embed:render.res']])
	})

	it('skips a request already past its deadline', async () => {
		queue(req(Date.now() - 1))
		bus.onRenderRequest(async () => {
			calls++
			return { pages: [], natural: { w: 1, h: 1 } }
		})
		await tick()
		expect([calls, sent]).toEqual([0, []])
	})

	it('drops an answer that finishes past the deadline', async () => {
		queue(req(Date.now() + 5))
		bus.onRenderRequest(async () => {
			calls++
			await tick(20)
			return { pages: [], natural: { w: 1, h: 1 } }
		})
		await tick(40)
		expect([calls, sent]).toEqual([1, []])
	})

	it('answers an oversized render with an error, not silence', async () => {
		const payloads: unknown[] = []
		;(bus as unknown as { sendToShell: (m: { payload: unknown }) => void }).sendToShell = (
			m
		) => {
			payloads.push(m.payload)
		}
		queue(req(Date.now() + 1000))
		bus.onRenderRequest(async () => ({
			pages: new Array(201).fill(''),
			natural: { w: 1, h: 1 }
		}))
		await tick()
		expect(payloads).toEqual([{ reqId: 'r1', ok: false, error: 'Render output too large' }])
	})
})

// vim: ts=4
