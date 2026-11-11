// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { apiFetchHelper } from '../api.js'
import { tListActionsResult } from '../api-types.js'

// A newer node may send enum values and malformed rows this client does not know.
// The list must still decode through the real fetch path: unknown enums widen to
// 'unknown', a broken row is dropped and reported.
describe('version-skew tolerant decoding', () => {
	it('keeps unknown enums and drops malformed items', async () => {
		const rows = [
			{
				id: 'a1',
				type: 'POST',
				issuer: { idTag: 'bot.example', name: 'Bot', type: 'bot' },
				createdAt: '1970-01-01T00:00:01Z'
			},
			{
				id: 'a2',
				type: 'POST',
				issuer: { idTag: 'alice.example', name: 'Alice', type: 'person' },
				createdAt: '1970-01-01T00:00:02Z',
				status: 'U'
			},
			{ id: 'a3', type: 'POST', createdAt: '1970-01-01T00:00:03Z' } // no issuer: malformed
		]
		;(globalThis as unknown as { fetch: unknown }).fetch = async () => ({
			ok: true,
			status: 200,
			text: async () => JSON.stringify({ data: rows })
		})
		const warned: unknown[][] = []
		const origWarn = console.warn
		console.warn = (...args: unknown[]) => {
			warned.push(args)
		}

		try {
			const res = await apiFetchHelper('me.example', 'GET', '/actions', {
				type: tListActionsResult
			})

			expect(res.map((a) => a.id)).toEqual(['a1', 'a2'])
			expect(res[0].issuer.type).toBe('unknown')
			expect(res[1].issuer.type).toBe('person')
			expect(res[1].status).toBe('unknown')
			expect(warned).toHaveLength(1)
			expect(warned[0][0]).toBe('API-SKIP-ITEM')
		} finally {
			console.warn = origWarn
		}
	})
})
