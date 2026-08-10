// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Cancellable requests.
 *
 * The search surfaces supersede their own queries while the user types, so a
 * superseded query must stop travelling the wire rather than merely have its
 * answer discarded — and an abort must not look like an auth failure: a cancelled
 * request never reached a verdict, and token recovery per keystroke would cost
 * more than the request it replaced.
 *
 * Hand-rolled stubs rather than `jest.fn()`: this package runs its suites as ESM,
 * where the `jest` object is not a global and `@jest/globals` is not a dependency
 * (see the note in `notifications.test.ts`).
 */

import { createApiClient, setAuthErrorHandler } from '../api-client'

const IDTAG = 'user.example.com'

interface FetchInit {
	signal?: AbortSignal
}

/** Records every call and answers with whatever the test installed. */
function stubFetch(impl: (url: string, init: FetchInit) => Promise<unknown>) {
	const calls: FetchInit[] = []
	const fn = (url: string, init: FetchInit) => {
		calls.push(init)
		return impl(url, init)
	}
	;(globalThis as unknown as { fetch: unknown }).fetch = fn
	return calls
}

/** Answers like the server would, with the standard response envelope. */
async function ok(data: unknown) {
	return {
		ok: true,
		status: 200,
		text: async () => JSON.stringify({ data, pagination: { total: 0 } })
	}
}

afterEach(() => {
	setAuthErrorHandler(undefined)
})

describe('search requests carry the abort signal they were given', () => {
	it('hands the signal to fetch', async () => {
		const calls = stubFetch(() => ok([]))
		const ctrl = new AbortController()
		const api = createApiClient({ idTag: IDTAG })

		await api.search.query({ q: 'text' }, { signal: ctrl.signal })

		expect(calls).toHaveLength(1)
		expect(calls[0].signal).toBe(ctrl.signal)
	})

	it('rejects with an AbortError, not a FetchError, when cancelled', async () => {
		stubFetch(
			(_url, init) =>
				new Promise((_resolve, reject) => {
					init.signal?.addEventListener('abort', () =>
						reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
					)
				})
		)
		const ctrl = new AbortController()
		const api = createApiClient({ idTag: IDTAG })

		const pending = api.search.queryPaginated({ q: 'text' }, { signal: ctrl.signal })
		ctrl.abort()

		await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
	})

	it('does not run auth recovery for a cancelled request', async () => {
		// A 401 that arrives *after* the caller gave up: recovery would refresh a
		// token nobody is waiting for, and retry a query already superseded.
		const ctrl = new AbortController()
		const calls = stubFetch(async () => {
			ctrl.abort()
			return {
				ok: false,
				status: 401,
				text: async () => JSON.stringify({ error: { code: 'E-AUTH-UNAUTH' } })
			}
		})
		let recoveries = 0
		setAuthErrorHandler(async () => {
			recoveries++
			return { token: 'fresh' }
		})
		const api = createApiClient({ idTag: IDTAG, authToken: 'stale' })

		await expect(api.search.query({ q: 'text' }, { signal: ctrl.signal })).rejects.toBeDefined()

		expect(recoveries).toBe(0)
		expect(calls).toHaveLength(1) // no retry
	})
})

// vim: ts=4
