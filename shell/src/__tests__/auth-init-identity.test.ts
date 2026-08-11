// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Which identity an `auth:init.res` hands an app, and whether it is flagged as
 * a real one.
 *
 * `authenticated` is what `buildPresenceUser` (libs/core/src/presence.ts) gates
 * publishing an idTag on: the shell hands a share-link guest the DOCUMENT
 * OWNER's tag, so an unflagged idTag would put the owner's name and face on
 * every visitor. The relayed-embed branch used to omit the key entirely, which
 * de-identified even the signed-in owner of an embedded document — and embeds
 * are initialised only there, so no later push corrects it.
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

interface BusOpts {
	pending?: Map<string, PendingRegistration>
	/** `null` for a visitor with no session. */
	authState?: { idTag?: string; tnId?: number; roles?: string[] } | null
	/** What `getApp()` reports — an initialised connection is what routes an
	 *  `_embed:` resId down the relayed-embed branch. */
	connection?: Record<string, unknown>
}

function createBus({ pending = new Map(), authState, connection }: BusOpts) {
	const responses: Response[] = []

	let handler: ((msg: unknown, source: unknown) => Promise<void>) | undefined

	const bus = {
		on(type: string, fn: (msg: unknown, source: unknown) => Promise<void>) {
			if (type === 'auth:init.req') handler = fn
		},
		getAppTracker: () => ({
			getApp: () => connection,
			consumePendingRegistration: (resId: string) => {
				const entry = pending.get(resId)
				pending.delete(resId)
				return entry
			},
			registerApp: (info: Record<string, unknown>) => ({ ...info, initialized: false }),
			markInitialized: () => {}
		}),
		getAuthState: () => authState ?? undefined,
		getThemeState: () => ({ darkMode: false }),
		getLanguage: () => 'en',
		getAccessToken: async () => ({ token: 'minted-token', tokenLifetime: 300 }),
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
		async init(resId: string, appName = 'quillo') {
			await handler?.({ id: 1, payload: { appName, resId } }, {} as Window)
		}
	}
}

const SIGNED_IN = { idTag: '@user.example.com', tnId: 1, roles: [] }

beforeEach(() => {
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

describe('auth:init.res identity — relayed embed', () => {
	function embedBus(authState: BusOpts['authState']) {
		return createBus({
			pending: new Map([
				// What handlers/embed.ts sets: the embed CONTEXT, i.e. the
				// community/owner node, never the viewer's identity.
				['_embed:n1', { idTag: '@team.example.com', token: 'embed-token', access: 'read' }]
			]),
			authState,
			connection: { initialized: true }
		})
	}

	it('flags a signed-in viewer and hands them their own idTag', async () => {
		const bus = embedBus(SIGNED_IN)

		await bus.init('_embed:n1')

		expect(bus.responses).toHaveLength(1)
		expect(bus.responses[0]).toMatchObject({ type: 'auth:init.res', ok: true })
		expect(bus.responses[0].data).toMatchObject({
			idTag: '@user.example.com',
			authenticated: true,
			token: 'embed-token'
		})
	})

	it('always sends the key, so an app cannot read a missing flag as false', async () => {
		const bus = embedBus(SIGNED_IN)

		await bus.init('_embed:n1')

		// `toMatchObject` above passes on an absent key holding `undefined`; the
		// regression this locks is exactly an omitted key.
		expect(Object.keys(bus.responses[0].data ?? {})).toContain('authenticated')
	})

	it('leaves a visitor with no session on the context tag, unflagged', async () => {
		const bus = embedBus(null)

		await bus.init('_embed:n1')

		expect(bus.responses[0].data).toMatchObject({
			idTag: '@team.example.com',
			authenticated: false
		})
	})
})

describe('auth:init.res identity — normal mount', () => {
	it('flags a signed-in user', async () => {
		const bus = createBus({
			pending: new Map([['@user.example.com:file-a', { access: 'write' }]]),
			authState: SIGNED_IN
		})

		await bus.init('@user.example.com:file-a')

		expect(bus.responses[0].data).toMatchObject({ authenticated: true })
	})

	/**
	 * `shell/src/apps/index.tsx` records the connection's idTag as
	 * `currentAuth?.idTag || currentContextIdTag` while auth is still resolving,
	 * so it can hold the OWNER's tag. An `auth:init.req` landing after auth
	 * resolves but before `initApp` corrects the connection must not hand that
	 * stale tag over flagged as a real identity, or a guest impersonates the owner.
	 */
	it('prefers the signed-in identity over a stale connection tag', async () => {
		const bus = createBus({
			pending: new Map([['@owner.example.com:file-a', { access: 'write' }]]),
			authState: SIGNED_IN,
			connection: { idTag: '@owner.example.com', access: 'write' }
		})

		await bus.init('@owner.example.com:file-a')

		expect(bus.responses[0].data).toMatchObject({
			idTag: '@user.example.com',
			authenticated: true
		})
	})

	it('does not flag a share-link guest carrying the owner tag', async () => {
		const bus = createBus({
			pending: new Map([
				['@owner.example.com:file-a', { access: 'read', token: 'share-token' }]
			]),
			authState: null
		})

		await bus.init('@owner.example.com:file-a')

		expect(bus.responses[0].data).toMatchObject({
			// Derived from the resId — the owner's tag, not an identity.
			idTag: '@owner.example.com',
			authenticated: false
		})
	})
})

// vim: ts=4
