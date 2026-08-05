// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The shared proactive-renewal schedule.
 *
 * The load-bearing case is the throwing `renew`: the callback is nobody's
 * awaited promise, so an uncaught rejection both escaped as an unhandled
 * rejection and skipped the retry re-arm — one offline moment permanently ended
 * renewal for that session, iframe or context, which then died at `exp`.
 */

import { jest } from '@jest/globals'

// `renewal-timer` schedules through `window.setTimeout`, and the suite runs in
// the node environment. Aliasing the global object keeps the faked timers in
// play (jest patches the globals, not a separate window).
;(globalThis as unknown as { window: typeof globalThis }).window = globalThis

const { createRenewer } = await import('../auth/renewal-timer.js')

/** An unsigned token carrying just the claims the schedule reads. */
function makeToken(claims: { iat?: number; exp: number }): string {
	// base64url, the encoding `decodeJwtPayload` expects — plain base64 padding
	// and `+`/`/` would not survive it.
	const payload = btoa(JSON.stringify(claims))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '')
	return `header.${payload}.sig`
}

/** A token issued now and valid for `lifetimeSec`. */
function freshToken(lifetimeSec: number): string {
	const iat = Math.floor(Date.now() / 1000)
	return makeToken({ iat, exp: iat + lifetimeSec })
}

beforeEach(() => {
	jest.useFakeTimers()
	// A fixed epoch, so the `iat`-anchored delay is exactly 80% of the lifetime.
	jest.setSystemTime(new Date('2026-01-01T00:00:00Z'))
})

afterEach(() => {
	jest.useRealTimers()
	jest.restoreAllMocks()
})

describe('createRenewer', () => {
	it('renews at 80% of the token lifetime and re-arms from the new token', async () => {
		const renew = jest.fn(async () => freshToken(1000))
		const onToken = jest.fn()
		const renewer = createRenewer(renew, { onToken })

		renewer.schedule(freshToken(1000))
		await jest.advanceTimersByTimeAsync(799_000)
		expect(renew).not.toHaveBeenCalled()

		await jest.advanceTimersByTimeAsync(2_000)
		expect(renew).toHaveBeenCalledTimes(1)
		expect(onToken).toHaveBeenCalledTimes(1)

		// The success path re-armed from the token that just came back.
		await jest.advanceTimersByTimeAsync(800_000)
		expect(renew).toHaveBeenCalledTimes(2)

		renewer.cancel()
	})

	it('retries when renew answers undefined', async () => {
		const renew = jest.fn(async () => undefined)
		const renewer = createRenewer(renew)

		renewer.schedule(freshToken(1000))
		await jest.advanceTimersByTimeAsync(800_000)
		expect(renew).toHaveBeenCalledTimes(1)

		// RENEWAL_RETRY_MS, still well inside the token's remaining life.
		await jest.advanceTimersByTimeAsync(30_000)
		expect(renew).toHaveBeenCalledTimes(2)

		renewer.cancel()
	})

	it('retries when renew throws', async () => {
		// Uncaught, this rejection skipped the retry re-arm below it entirely, so
		// the chain ended on the first network blip.
		jest.spyOn(console, 'error').mockImplementation(() => {})
		const renew = jest.fn(async () => {
			throw new Error('offline')
		})
		const renewer = createRenewer(renew)

		renewer.schedule(freshToken(1000))
		await jest.advanceTimersByTimeAsync(800_000)
		expect(renew).toHaveBeenCalledTimes(1)

		await jest.advanceTimersByTimeAsync(30_000)
		expect(renew).toHaveBeenCalledTimes(2)
		// Backoff doubles, so the third attempt is a minute out, not 30 s.
		await jest.advanceTimersByTimeAsync(30_000)
		expect(renew).toHaveBeenCalledTimes(2)
		await jest.advanceTimersByTimeAsync(30_000)
		expect(renew).toHaveBeenCalledTimes(3)

		renewer.cancel()
	})

	it('stops retrying once the token it was armed from has expired', async () => {
		jest.spyOn(console, 'warn').mockImplementation(() => {})
		const renew = jest.fn(async () => undefined)
		const renewer = createRenewer(renew)

		// 80% of 100 s is 80 s; the first retry lands at 110 s, past `exp`.
		renewer.schedule(freshToken(100))
		await jest.advanceTimersByTimeAsync(80_000)
		expect(renew).toHaveBeenCalledTimes(1)

		await jest.advanceTimersByTimeAsync(30_000)
		expect(renew).toHaveBeenCalledTimes(2)
		await jest.advanceTimersByTimeAsync(300_000)
		expect(renew).toHaveBeenCalledTimes(2)
	})

	it('does not fire after cancel', async () => {
		const renew = jest.fn(async () => undefined)
		const renewer = createRenewer(renew)

		renewer.schedule(freshToken(1000))
		renewer.cancel()
		await jest.advanceTimersByTimeAsync(1_000_000)
		expect(renew).not.toHaveBeenCalled()
	})
})

/**
 * The already-expired path. `schedule` cannot serve it — `renewalDelayMs`
 * answers null for a dead token, i.e. "arm nothing" — and the caller that
 * reaches for it (`useContextTokenRenewal`) gets no re-render out of a
 * successful same-roles mint, so nothing would ever come back to arm the
 * proactive timer. `renewNow` has to close that loop itself.
 */
describe('createRenewer#renewNow', () => {
	it('arms the proactive schedule from the token it minted', async () => {
		const renew = jest.fn(async () => freshToken(1000))
		const onToken = jest.fn()
		const renewer = createRenewer(renew, { onToken })

		renewer.renewNow()
		await jest.advanceTimersByTimeAsync(0)
		expect(renew).toHaveBeenCalledTimes(1)
		expect(onToken).toHaveBeenCalledTimes(1)

		// The load-bearing half: without this the fresh 24h token would carry no
		// renewal timer at all and the context would die at `exp`.
		await jest.advanceTimersByTimeAsync(800_000)
		expect(renew).toHaveBeenCalledTimes(2)

		renewer.cancel()
	})

	it('retries a failed mint on the same backoff, up to the 5 min ceiling', async () => {
		const renew = jest.fn(async () => undefined)
		const renewer = createRenewer(renew)

		renewer.renewNow()
		await jest.advanceTimersByTimeAsync(0)
		expect(renew).toHaveBeenCalledTimes(1)

		await jest.advanceTimersByTimeAsync(30_000)
		expect(renew).toHaveBeenCalledTimes(2)
		// Doubles, so the third attempt is a minute out, not 30 s.
		await jest.advanceTimersByTimeAsync(30_000)
		expect(renew).toHaveBeenCalledTimes(2)
		await jest.advanceTimersByTimeAsync(30_000)
		expect(renew).toHaveBeenCalledTimes(3)

		await jest.advanceTimersByTimeAsync(120_000)
		expect(renew).toHaveBeenCalledTimes(4)
		await jest.advanceTimersByTimeAsync(240_000)
		expect(renew).toHaveBeenCalledTimes(5)
		// Capped from here: 480 s would be next, 300 s is the ceiling.
		await jest.advanceTimersByTimeAsync(300_000)
		expect(renew).toHaveBeenCalledTimes(6)
		await jest.advanceTimersByTimeAsync(300_000)
		expect(renew).toHaveBeenCalledTimes(7)

		renewer.cancel()
	})

	it('discards a mint cancelled while it was in flight', async () => {
		let settle!: (token: string | undefined) => void
		const renew = jest.fn(
			() =>
				new Promise<string | undefined>((resolve) => {
					settle = resolve
				})
		)
		const onToken = jest.fn()
		const renewer = createRenewer(renew, { onToken })

		renewer.renewNow()
		await jest.advanceTimersByTimeAsync(0)
		renewer.cancel()
		settle(freshToken(1000))
		await jest.advanceTimersByTimeAsync(1_000_000)

		// Neither the push to the caller nor the re-arm may survive the cancel.
		expect(onToken).not.toHaveBeenCalled()
		expect(renew).toHaveBeenCalledTimes(1)
	})

	it('floors the mint rate', async () => {
		// A caller that keeps judging its token expired (unparseable `exp`, clock
		// ahead) would otherwise be an unthrottled request loop.
		const renew = jest.fn(async () => undefined)
		const renewer = createRenewer(renew)

		renewer.renewNow()
		await jest.advanceTimersByTimeAsync(1_000)
		renewer.renewNow()
		expect(renew).toHaveBeenCalledTimes(1)

		renewer.cancel()
	})
})

// vim: ts=4
