// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { ApiClient } from '../api-client'

// Unchecking the push toggle only called PushSubscription.unsubscribe(), so the server kept the
// row and kept pushing to a dead endpoint. The DELETE keys on the numeric id the POST returned -
// there is no GET counterpart - so the path has to interpolate exactly that id.
describe('notifications.unsubscribe', () => {
	it('DELETEs the subscription by its numeric id', async () => {
		const client = new ApiClient({ idTag: 'alice.example' })
		// A plain assignment rather than jest.spyOn: the `jest` global is not injected under ESM
		// and @jest/globals is not a dependency of this package. `request` is a public method and
		// the endpoint helpers reach it through `this`, so shadowing it on the instance is enough.
		const calls: [string, string][] = []
		client.request = (async (method: string, path: string) => {
			calls.push([method, path])
			return null
		}) as typeof client.request

		await client.notifications.unsubscribe(42)

		// No '/api' prefix: getApiUrl() adds it
		expect(calls).toEqual([['DELETE', '/notifications/subscription/42']])
	})
})
