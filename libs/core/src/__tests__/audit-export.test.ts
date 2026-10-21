// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * `exportAuditCsv` bypasses `apiFetchHelper` (the body is a Blob) but shares `request()`'s
 * 401 → refresh → single retry. Hand-rolled stubs, as in `search-abort.test.ts`.
 */

import { createApiClient, setAuthErrorHandler } from '../api-client'

const IDTAG = 'admin.example.com'

const unauthorized = () => ({
	ok: false,
	status: 401,
	text: async () => JSON.stringify({ error: { code: 'E-AUTH-UNAUTH' } }),
	blob: async () => new Blob()
})

/** Answers each call with the next response; records the Authorization headers */
function stubFetch(responses: unknown[]) {
	const auth: (string | undefined)[] = []
	;(globalThis as unknown as { fetch: unknown }).fetch = async (
		_url: string,
		init: { headers: Record<string, string> }
	) => {
		auth.push(init.headers.Authorization)
		return responses.shift()
	}
	return auth
}

afterEach(() => {
	setAuthErrorHandler(undefined)
})

describe('exportAuditCsv', () => {
	it('refreshes the token on a 401 and returns the retry blob', async () => {
		const csv = new Blob(['a,b'])
		const auth = stubFetch([unauthorized(), { ok: true, status: 200, blob: async () => csv }])
		setAuthErrorHandler(async () => ({ token: 'fresh' }))
		const api = createApiClient({ idTag: IDTAG, authToken: 'stale' })

		await expect(api.admin.exportAuditCsv()).resolves.toBe(csv)
		expect(auth).toEqual(['Bearer stale', 'Bearer fresh'])
	})

	it('rejects when the retry is a 401 too', async () => {
		const auth = stubFetch([unauthorized(), unauthorized()])
		setAuthErrorHandler(async () => ({ token: 'fresh' }))
		const api = createApiClient({ idTag: IDTAG, authToken: 'stale' })

		await expect(api.admin.exportAuditCsv()).rejects.toMatchObject({ httpStatus: 401 })
		expect(auth).toHaveLength(2) // no second refresh
	})

	it('marks the error sessionExpired when recovery already redirected', async () => {
		const auth = stubFetch([unauthorized()])
		setAuthErrorHandler(async () => ({ handled: true }))
		const api = createApiClient({ idTag: IDTAG, authToken: 'stale' })

		await expect(api.admin.exportAuditCsv()).rejects.toMatchObject({
			httpStatus: 401,
			sessionExpired: true
		})
		expect(auth).toHaveLength(1)
	})
})

// vim: ts=4
