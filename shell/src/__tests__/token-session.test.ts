// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The process-wide home-token renewal slot.
 *
 * The load-bearing case is the last one in the first block: a 401 recovery that
 * is *satisfied* by a proactive refresh never re-exchanges the API key and never
 * declares the session dead, leaving the user on a session nothing will repair.
 */

import { jest } from '@jest/globals'

import { awaitTokenRenewal, runRenewal } from '../auth/token-session.js'

/**
 * The slot is free. `awaitTokenRenewal` resolves immediately with `undefined`
 * only when nothing occupies it — an occupant would surface its own settled
 * value instead. (Observed through the public API: the slot itself is private.)
 */
async function expectSlotFree() {
	await expect(awaitTokenRenewal(5000)).resolves.toBeUndefined()
}

/** A promise plus the resolvers the test drives it with. */
function deferred<T>() {
	let resolve: (value: T) => void = () => {}
	let reject: (err: unknown) => void = () => {}
	const promise = new Promise<T>((res, rej) => {
		resolve = res
		reject = rej
	})
	return { promise, resolve, reject }
}

// Fake timers throughout, so `awaitTokenRenewal`'s bounded wait can be driven
// without the suite sleeping for it.
beforeEach(() => {
	jest.useFakeTimers()
})

afterEach(() => {
	jest.useRealTimers()
})

describe('runRenewal', () => {
	it('shares one run between concurrent refreshes', async () => {
		const d = deferred<string | undefined>()
		const fn = jest.fn(() => d.promise)

		const a = runRenewal('refresh', fn)
		const b = runRenewal('refresh', fn)
		expect(fn).toHaveBeenCalledTimes(1)

		d.resolve('tok')
		await expect(a).resolves.toBe('tok')
		await expect(b).resolves.toBe('tok')
	})

	it('shares one run between concurrent recoveries', async () => {
		const d = deferred<string | undefined>()
		const fn = jest.fn(() => d.promise)

		const a = runRenewal('recover', fn)
		const b = runRenewal('recover', fn)
		expect(fn).toHaveBeenCalledTimes(1)

		d.resolve('tok')
		await expect(a).resolves.toBe('tok')
		await expect(b).resolves.toBe('tok')
	})

	it('joins a running recovery when a refresh arrives', async () => {
		const d = deferred<string | undefined>()
		const recover = jest.fn(() => d.promise)
		const refresh = jest.fn(async () => 'refreshed')

		const rec = runRenewal('recover', recover)
		const ref = runRenewal('refresh', refresh)
		// A recovery that succeeds produces a usable token, so the refresh has
		// nothing to add.
		expect(refresh).not.toHaveBeenCalled()

		d.resolve('recovered')
		await expect(rec).resolves.toBe('recovered')
		await expect(ref).resolves.toBe('recovered')
	})

	it('takes the refresh’s token when a recovery lands behind a successful one', async () => {
		const d = deferred<string | undefined>()
		const refresh = jest.fn(() => d.promise)
		const recover = jest.fn(async () => 'recovered')

		const ref = runRenewal('refresh', refresh)
		const rec = runRenewal('recover', recover)

		d.resolve('refreshed')
		await expect(ref).resolves.toBe('refreshed')
		// The session was merely stale, not dead — no API-key exchange needed.
		await expect(rec).resolves.toBe('refreshed')
		expect(recover).not.toHaveBeenCalled()
	})

	it('runs the recovery when the refresh it waited on yields nothing', async () => {
		// Aliasing the slot would return the refresh's undefined here, so the 401
		// path would never re-exchange the API key nor declare the session dead —
		// no toast, no redirect, just a bare request error.
		const d = deferred<string | undefined>()
		const refresh = jest.fn(() => d.promise)
		const recover = jest.fn(async () => 'recovered')

		const ref = runRenewal('refresh', refresh)
		const rec = runRenewal('recover', recover)

		d.resolve(undefined)
		await expect(ref).resolves.toBeUndefined()
		await expect(rec).resolves.toBe('recovered')
		expect(recover).toHaveBeenCalledTimes(1)
	})

	it('runs the recovery when the refresh it waited on rejects', async () => {
		const d = deferred<string | undefined>()
		const refresh = jest.fn(() => d.promise)
		const recover = jest.fn(async () => 'recovered')

		const ref = runRenewal('refresh', refresh)
		const rec = runRenewal('recover', recover)

		d.reject(new Error('network'))
		await expect(ref).rejects.toThrow('network')
		await expect(rec).resolves.toBe('recovered')
	})

	it('releases the slot on settle, so the next call runs fn again', async () => {
		const fn = jest.fn(async () => 'tok')
		await runRenewal('refresh', fn)
		await expectSlotFree()

		await runRenewal('refresh', fn)
		expect(fn).toHaveBeenCalledTimes(2)
	})

	it('releases the slot when fn rejects', async () => {
		const failing = jest.fn(async () => {
			throw new Error('boom')
		})
		await expect(runRenewal('recover', failing)).rejects.toThrow('boom')
		await expectSlotFree()

		await expect(runRenewal('recover', failing)).rejects.toThrow('boom')
		expect(failing).toHaveBeenCalledTimes(2)
	})

	it('runs the recovery once for two recoveries queued behind one refresh', async () => {
		// Without the chain claiming the slot as it is built, the second recovery
		// sees the refresh still in flight and builds a chain of its own — so the
		// API-key exchange runs twice, concurrently, on one 401.
		const d = deferred<string | undefined>()
		const refresh = jest.fn(() => d.promise)
		const recover = jest.fn(async () => 'recovered')

		const ref = runRenewal('refresh', refresh)
		const recA = runRenewal('recover', recover)
		const recB = runRenewal('recover', recover)

		d.resolve(undefined)
		await expect(ref).resolves.toBeUndefined()
		await expect(recA).resolves.toBe('recovered')
		await expect(recB).resolves.toBe('recovered')
		expect(recover).toHaveBeenCalledTimes(1)
		await expectSlotFree()
	})

	it('releases the slot after a chained recovery completes', async () => {
		const d = deferred<string | undefined>()
		const ref = runRenewal('refresh', () => d.promise)
		const rec = runRenewal('recover', async () => 'recovered')

		d.resolve(undefined)
		await ref
		await rec
		await expectSlotFree()
	})
})

describe('awaitTokenRenewal', () => {
	it('resolves immediately when nothing is in flight', async () => {
		await expect(awaitTokenRenewal(5000)).resolves.toBeUndefined()
	})

	it('resolves with the in-flight renewal’s token', async () => {
		const d = deferred<string | undefined>()
		const run = runRenewal('refresh', () => d.promise)
		const joined = awaitTokenRenewal(5000)

		d.resolve('tok')
		await expect(joined).resolves.toBe('tok')
		await run
	})

	it('resolves with undefined when the in-flight renewal rejects', async () => {
		// The slot holds the raw run, so racing it bare propagated the rejection to
		// every joiner. `useAppToken` does not catch it, so its renewer never
		// re-armed: one offline refresh permanently ended that iframe's renewal.
		const d = deferred<string | undefined>()
		const run = runRenewal('refresh', () => d.promise)
		const joined = awaitTokenRenewal(50)

		d.reject(new Error('offline'))
		await expect(joined).resolves.toBeUndefined()
		await expect(run).rejects.toThrow('offline')
	})

	it('gives up with undefined when the renewal hangs', async () => {
		const d = deferred<string | undefined>()
		const run = runRenewal('refresh', () => d.promise)

		const joined = awaitTokenRenewal(5000)
		jest.advanceTimersByTime(5001)
		await expect(joined).resolves.toBeUndefined()

		// Let the renewal finish so the slot is free for the next test.
		d.resolve('late')
		await run
	})
})

// vim: ts=4
