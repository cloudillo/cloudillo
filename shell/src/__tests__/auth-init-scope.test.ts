// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * What an app iframe may ask `auth:init.req` for.
 *
 * That message is exempt from `validateSource` (shell/src/message-bus/shell-bus.ts),
 * so its `resId` is whatever the app claimed. Registering the app on that claim
 * with no pending registration to match — and then minting at `access: 'write'` —
 * lets a compromised app opened on file A receive a write-scoped token for file B.
 */

import { jest } from '@jest/globals'

import { initAuthHandlers } from '../message-bus/handlers/auth.js'

interface PendingRegistration {
	access?: 'read' | 'write'
	idTag?: string
	token?: string
	displayName?: string
}

interface Response {
	type: string
	ok: boolean
	data?: Record<string, unknown>
	error?: string
}

/**
 * The slice of `ShellMessageBus` + `AppTracker` this handler touches. Stubbed
 * rather than constructed: the real bus reaches for `window` and the API client.
 */
function createBus(pending: Map<string, PendingRegistration>) {
	const responses: Response[] = []
	const registered: Array<Record<string, unknown>> = []
	const getAccessToken = jest.fn(async (_resId: string, _access: string) => ({
		token: 'minted-token',
		tokenLifetime: 300
	}))
	let handler: ((msg: unknown, source: unknown) => Promise<void>) | undefined

	const bus = {
		on(type: string, fn: (msg: unknown, source: unknown) => Promise<void>) {
			if (type === 'auth:init.req') handler = fn
		},
		getAppTracker: () => ({
			getApp: () => undefined,
			consumePendingRegistration: (resId: string) => {
				const entry = pending.get(resId)
				pending.delete(resId)
				return entry
			},
			registerApp: (info: Record<string, unknown>) => {
				registered.push(info)
				return { ...info, initialized: false }
			},
			markInitialized: () => {}
		}),
		getAuthState: () => ({ idTag: '@user.example.com', tnId: 1, roles: [] }),
		getThemeState: () => ({ darkMode: false }),
		getLanguage: () => 'en',
		getAccessToken,
		sendResponse: (
			_win: unknown,
			type: string,
			_id: unknown,
			ok: boolean,
			data?: Record<string, unknown>,
			error?: string
		) => {
			responses.push({ type, ok, data, error })
		}
	}

	// biome-ignore lint/suspicious/noExplicitAny: the stub is a deliberate subset
	initAuthHandlers(bus as any)

	return {
		responses,
		registered,
		getAccessToken,
		async init(resId: string, appName = 'quillo') {
			await handler?.({ id: 1, payload: { appName, resId } }, {} as Window)
		}
	}
}

beforeEach(() => {
	// The handler skips the token fetch entirely when offline.
	Object.defineProperty(globalThis, 'navigator', {
		value: { onLine: true },
		writable: true,
		configurable: true
	})
	jest.spyOn(console, 'warn').mockImplementation(() => {})
	jest.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
	jest.restoreAllMocks()
})

describe('auth:init.req', () => {
	it('initialises at the access the container registered', async () => {
		const pending = new Map<string, PendingRegistration>([
			['@user.example.com:file-a', { access: 'read', idTag: '@user.example.com' }]
		])
		const bus = createBus(pending)

		await bus.init('@user.example.com:file-a')

		expect(bus.responses).toHaveLength(1)
		expect(bus.responses[0]).toMatchObject({ type: 'auth:init.res', ok: true })
		expect(bus.responses[0].data).toMatchObject({ access: 'read', token: 'minted-token' })
		// Least privilege: the pending registration's access, not the default.
		expect(bus.getAccessToken).toHaveBeenCalledWith('@user.example.com:file-a', 'read')
		expect(bus.registered[0]).toMatchObject({ access: 'read' })
	})

	it('rejects a resId the container never registered, without minting', async () => {
		const pending = new Map<string, PendingRegistration>([
			['@user.example.com:file-a', { access: 'read' }]
		])
		const bus = createBus(pending)

		// The iframe was opened on file-a and asks for file-b.
		await bus.init('@user.example.com:file-b')

		expect(bus.responses).toHaveLength(1)
		expect(bus.responses[0]).toMatchObject({
			type: 'auth:init.res',
			ok: false,
			error: 'App not registered'
		})
		expect(bus.getAccessToken).not.toHaveBeenCalled()
		expect(bus.registered).toHaveLength(0)
	})

	it('rejects an init.req with no resId at all', async () => {
		const bus = createBus(new Map())

		await bus.init(undefined as unknown as string)

		expect(bus.responses[0]).toMatchObject({ ok: false, error: 'App not registered' })
		expect(bus.getAccessToken).not.toHaveBeenCalled()
	})

	it('consumes the pending registration, so a replayed init.req is rejected', async () => {
		const pending = new Map<string, PendingRegistration>([
			['@user.example.com:file-a', { access: 'write' }]
		])
		const bus = createBus(pending)

		await bus.init('@user.example.com:file-a')
		expect(bus.responses[0].ok).toBe(true)

		// A second window replaying the same message finds nothing pending — the
		// legitimate second init.req is answered from the connection instead.
		await bus.init('@user.example.com:file-a')
		expect(bus.responses[1]).toMatchObject({ ok: false, error: 'App not registered' })
		expect(bus.getAccessToken).toHaveBeenCalledTimes(1)
	})
})

// vim: ts=4
