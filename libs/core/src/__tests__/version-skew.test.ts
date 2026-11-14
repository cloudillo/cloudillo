// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { tProfileStatus, tSearchKind } from '@cloudillo/types'
import * as T from '@symbion/runtype'

import { apiFetchHelper, isNoRouteError } from '../api.js'
import { tListActionsResult, tProxySiteStatus, tTenantView } from '../api-types.js'
import { getAppBus, resetAppBus } from '../message-bus/app-bus.js'
import { BUS_UNKNOWN_ERROR, unknownMessage } from '../message-bus/registry.js'
import { PROTOCOL_VERSION } from '../message-bus/types.js'

function stubFetch(status: number, body: unknown) {
	;(globalThis as unknown as { fetch: unknown }).fetch = async () => ({
		ok: status < 400,
		status,
		headers: new Headers(),
		text: async () => JSON.stringify(body)
	})
}

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

	it('passes deliveryError through and widens an unknown visibility', async () => {
		stubFetch(200, {
			data: [
				{
					id: 'a1',
					type: 'POST',
					issuer: { idTag: 'alice.example', name: 'Alice', type: 'person' },
					createdAt: '1970-01-01T00:00:01Z',
					visibility: 'galaxy',
					deliveryError: 'E-FED-UNREACHABLE'
				}
			]
		})
		const res = await apiFetchHelper('me.example', 'GET', '/actions', {
			type: tListActionsResult
		})
		expect(res[0].deliveryError).toBe('E-FED-UNREACHABLE')
		expect(res[0].visibility).toBe('unknown')
	})

	it('widens the remaining open enums to unknown', () => {
		const dec = <V>(t: T.Type<V>, v: unknown) => T.decode(t, v)
		expect(dec(tProfileStatus, 'frozen')).toEqual(T.ok('unknown'))
		expect(dec(tSearchKind, 'hologram')).toEqual(T.ok('unknown'))
		expect(dec(tProxySiteStatus, 'paused')).toEqual(T.ok('unknown'))
		const tenant = T.decode(tTenantView, {
			tnId: 1,
			idTag: 'x.example',
			name: 'X',
			type: 'robot',
			status: 'archived',
			createdAt: '1970-01-01T00:00:01Z'
		})
		expect(T.isOk(tenant) && [tenant.ok.type, tenant.ok.status]).toEqual(['unknown', 'unknown'])
	})

	it('tells an unsupported route apart from other errors', async () => {
		stubFetch(404, { error: { code: 'E-CORE-NOROUTE', message: 'No such route' } })
		const err = await apiFetchHelper('me.example', 'GET', '/future', {}).catch(
			(e: unknown) => e
		)
		expect(isNoRouteError(err)).toBe(true)

		stubFetch(404, { error: { code: 'E-CORE-NOTFOUND', message: 'Not found' } })
		const other = await apiFetchHelper('me.example', 'GET', '/x', {}).catch((e: unknown) => e)
		expect(isNoRouteError(other)).toBe(false)
	})
})

describe('version-skew message bus', () => {
	const frame = (extra: Record<string, unknown>) => ({
		cloudillo: true,
		v: PROTOCOL_VERSION,
		...extra
	})

	it('recognises an unregistered frame type, not a malformed registered one', () => {
		expect(unknownMessage(frame({ type: 'future:thing.req', id: 7 }))).toEqual({
			type: 'future:thing.req',
			id: 7
		})
		expect(
			unknownMessage(
				frame({ type: 'future:thing.res', replyTo: 7, error: BUS_UNKNOWN_ERROR })
			)
		).toEqual({ type: 'future:thing.res', replyTo: 7, error: 'E-BUS-UNKNOWN' })
		expect(unknownMessage(frame({ type: 'auth:init.res', replyTo: 'bad' }))).toBeUndefined()
		expect(unknownMessage({ type: 'future:thing.req' })).toBeUndefined()
	})

	/** Run `init()` against a fake shell that grants `access`; returns a push sender. */
	async function initWith(access: unknown) {
		resetAppBus()
		const bus = getAppBus()
		const sent: Array<Record<string, unknown>> = []
		window.parent.postMessage = ((msg: unknown) => {
			sent.push(msg as Record<string, unknown>)
		}) as typeof window.postMessage
		const data = { theme: 'glass', idTag: '@viewer.example', authenticated: true, token: 't' }
		const deliver = (msg: Record<string, unknown>) => {
			window.dispatchEvent(
				new MessageEvent('message', { source: window.parent, data: frame(msg) })
			)
		}
		const pending = bus.init('testapp')
		const req = sent.find((m) => m.type === 'auth:init.req') as { id: number }
		deliver({ type: 'auth:init.res', replyTo: req.id, ok: true, data: { ...data, access } })
		await pending
		const push = (pushAccess: string) => {
			deliver({ type: 'auth:init.push', payload: { ...data, access: pushAccess } })
		}
		return { bus, push }
	}

	const realPost = window.parent.postMessage
	afterEach(() => {
		window.parent.postMessage = realPost
		resetAppBus()
	})

	it.each([
		['an unknown', 'superuser'],
		['an "unknown"', 'unknown']
	])('treats %s access level from the shell as read-only', async (_label, access) => {
		const { bus } = await initWith(access)
		expect(bus.access).toBe('read')
	})

	it('treats a missing access level as write, like the shell', async () => {
		const { bus } = await initWith(undefined)
		expect(bus.access).toBe('write')
	})

	it('assumes write access offline, but never over the shell grant', async () => {
		resetAppBus()
		const offline = getAppBus()
		expect(offline.access).toBe('read')
		offline.assumeOfflineAccess()
		expect(offline.access).toBe('write')

		const { bus } = await initWith('read')
		bus.assumeOfflineAccess()
		expect(bus.access).toBe('read')
	})

	it('caps access below the grant until the cap is lifted', async () => {
		const { bus, push } = await initWith('write')
		let fired = 0
		bus.onIdentityChange(() => {
			fired++
		})

		expect(bus.accessCapped).toBe(false)
		bus.capAccess('comment')
		expect(bus.access).toBe('comment')
		expect(bus.accessCapped).toBe(true)
		expect(fired).toBe(1)

		// A later grant must not lift the cap
		push('write')
		expect(bus.access).toBe('comment')

		bus.capAccess(undefined)
		expect(bus.access).toBe('write')
		expect(bus.accessCapped).toBe(false)
		expect(fired).toBe(2)
	})

	it('never raises access above the grant', async () => {
		const { bus } = await initWith('read')
		bus.capAccess('comment')
		expect(bus.access).toBe('read')
		expect(bus.accessCapped).toBe(false)
	})
})
