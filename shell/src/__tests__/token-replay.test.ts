// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The worker's token-replay waiters and the `sw:token.none` quiet period.
 *
 * A regression here is silent: every unauthenticated `cl-o.*` request either
 * burns the full wait, or a login is not picked up until the next reload.
 */

// Not a global in ESM mode, unlike describe/it/expect.
import { jest } from '@jest/globals'

import { setAuthToken } from '../../sw/state.js'
import {
	notifyNoToken,
	notifyTokenReceived,
	requestTokenOnce,
	waitForToken
} from '../../sw/token-replay.js'

// Mirrors NO_TOKEN_QUIET_MS in sw/token-replay.ts (module-private).
const QUIET_MS = 5000

// `requestTokenFromClients` reads `self.clients`, which a node test environment
// has no equivalent of. Stubbed so the "stays quiet" assertion below is a real
// one — without it a missing broadcast and a thrown broadcast look the same.
const matchAll = jest.fn(async () => [] as unknown[])
;(globalThis as unknown as { self: unknown }).self = { clients: { matchAll } }

beforeEach(() => {
	jest.useFakeTimers()
	matchAll.mockClear()
	setAuthToken(undefined)
	// Clears the quiet period and settles anything a previous test left pending.
	notifyTokenReceived()
})

afterEach(() => {
	jest.useRealTimers()
})

describe('waitForToken', () => {
	it('resolves immediately when the worker already holds a token', async () => {
		setAuthToken('tok')
		await expect(waitForToken(1500)).resolves.toBe(true)
	})

	it('resolves false without waiting inside the quiet period', async () => {
		notifyNoToken()
		// No timer advance: a wait that burned the timeout would hang here.
		await expect(waitForToken(1500)).resolves.toBe(false)
	})

	it('settles pending waiters with true when a token arrives', async () => {
		const pending = waitForToken(1500)
		notifyTokenReceived()
		await expect(pending).resolves.toBe(true)
	})

	it('settles pending waiters with false on sw:token.none', async () => {
		const pending = waitForToken(1500)
		notifyNoToken()
		await expect(pending).resolves.toBe(false)
	})

	it('drops a timed-out waiter without disturbing the others', async () => {
		const first = waitForToken(1000)
		const second = waitForToken(5000)

		jest.advanceTimersByTime(1001)
		await expect(first).resolves.toBe(false)

		// `first` removed itself from the waiter list; `second` must still be
		// there and must still settle.
		notifyTokenReceived()
		await expect(second).resolves.toBe(true)
	})
})

describe('the sw:token.none quiet period', () => {
	it('suppresses the broadcast while quiet and resumes after it', async () => {
		notifyNoToken()
		await requestTokenOnce()
		expect(matchAll).not.toHaveBeenCalled()

		jest.advanceTimersByTime(QUIET_MS + 1)
		await requestTokenOnce()
		expect(matchAll).toHaveBeenCalledTimes(1)
	})

	it('is cleared by an arriving token, not only by time', async () => {
		notifyNoToken()
		notifyTokenReceived()

		await requestTokenOnce()
		expect(matchAll).toHaveBeenCalledTimes(1)

		// ...and a wait no longer short-circuits to false.
		const pending = waitForToken(1500)
		notifyTokenReceived()
		await expect(pending).resolves.toBe(true)
	})
})

// vim: ts=4
