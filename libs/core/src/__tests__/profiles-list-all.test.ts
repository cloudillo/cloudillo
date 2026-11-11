// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * `GET /profiles` is cursor-paged (default 50, max 100). `profiles.listAll` follows `next`
 * to the last page and sorts by display name, since the server pages by idTag.
 */

import { createApiClient } from '../api-client'

describe('profiles.listAll', () => {
	it('follows next through every page and sorts by name ?? idTag', async () => {
		const urls: string[] = []
		const pages = [
			{ data: [{ idTag: 'b.example' }, { idTag: 'c.example', name: 'Zed' }], next: 'c1' },
			{ data: [{ idTag: 'a.example', name: 'Anna' }] }
		]
		;(globalThis as unknown as { fetch: unknown }).fetch = async (url: string) => {
			urls.push(url)
			return {
				ok: true,
				status: 200,
				text: async () => JSON.stringify(pages[urls.length - 1])
			}
		}

		const api = createApiClient({ idTag: 'user.example' })
		const rows = await api.profiles.listAll({ type: 'person' })

		expect(rows.map((p) => p.idTag)).toEqual(['a.example', 'b.example', 'c.example'])
		expect(urls).toHaveLength(2)
		expect(urls[0]).toContain('limit=100')
		expect(urls[0]).not.toContain('cursor=')
		expect(urls[1]).toContain('cursor=c1')
	})
})

// vim: ts=4
