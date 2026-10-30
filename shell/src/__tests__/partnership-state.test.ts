// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import type { ApiClient } from '@cloudillo/core'
import { jest } from '@jest/globals'

import { partnershipState } from '../communities/partners.js'

function stub({
	connected,
	incoming = [],
	sent = []
}: {
	connected?: boolean
	incoming?: { issuer: { idTag: string } }[]
	sent?: { idTag: string }[]
}) {
	const list = jest.fn(async (q: { connected: boolean | 'R' }) =>
		q.connected === 'R' ? sent : connected ? [{ idTag: 'b.tld' }] : []
	)
	const client = {
		profiles: { list },
		actions: { list: async () => incoming }
	} as unknown as ApiClient
	return { client, list }
}

describe('partnershipState', () => {
	it('reports a connected peer as partner, by the hub list rule', async () => {
		const { client, list } = stub({ connected: true, sent: [{ idTag: 'b.tld' }] })
		expect(await partnershipState(client, 'a.tld', 'b.tld')).toBe('partner')
		expect(list).toHaveBeenCalledWith({
			idTag: 'b.tld',
			connected: true,
			status: ['A', 'M', 'S']
		})
	})

	it('reports an open request from the target as incoming', async () => {
		const { client } = stub({ connected: false, incoming: [{ issuer: { idTag: 'b.tld' } }] })
		expect(await partnershipState(client, 'a.tld', 'b.tld')).toBe('incoming')
	})

	it('reads a pending request of ours from the list endpoint', async () => {
		const { client, list } = stub({ connected: false, sent: [{ idTag: 'b.tld' }] })
		expect(await partnershipState(client, 'a.tld', 'b.tld')).toBe('sent')
		expect(list).toHaveBeenCalledWith({ idTag: 'b.tld', connected: 'R' })
	})

	it('reports no relation as null', async () => {
		const { client } = stub({ connected: false, incoming: [{ issuer: { idTag: 'c.tld' } }] })
		expect(await partnershipState(client, 'a.tld', 'b.tld')).toBeNull()
		expect(await partnershipState(stub({}).client, 'a.tld', 'b.tld')).toBeNull()
	})
})
