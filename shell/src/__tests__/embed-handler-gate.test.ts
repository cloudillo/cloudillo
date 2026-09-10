// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Which bus commands a shell-hosted embed may issue.
 *
 * An embed iframe (a feed `LiveDocCard`, a published page's site island) is untrusted
 * third-party content, and since `handlers/auth.ts` registers it on the shell-created
 * `pending.resId` rather than the `_embed:<nonce>` handshake key the app claims, its
 * `connection.resId` is now a REAL `<idTag>:<fileId>`. Every handler that derives a
 * tenant from it therefore fails OPEN unless it checks `connection.embed` explicitly —
 * these three used to.
 *
 * `handlers/docinfo.ts`, `handlers/share.ts`, `handlers/feed.ts` (see
 * `feed-post-gate.test.ts`) and `handlers/lifecycle.ts` carry the same guard.
 */

import { jest } from '@jest/globals'

import { getAppTracker, resetAppTracker } from '../message-bus/app-tracker.js'
import { initDocumentHandlers, setDocPickerCallback } from '../message-bus/handlers/document.js'
import { initEmbedHandlers } from '../message-bus/handlers/embed.js'
import { initMediaHandlers, setMediaPickerCallback } from '../message-bus/handlers/media.js'
import { ShellMessageBus } from '../message-bus/shell-bus.js'

type AppConnection = import('../message-bus/app-tracker.js').AppConnection

interface Response {
	type: string
	ok: boolean
	data?: Record<string, unknown>
	error?: string
}

/**
 * A bus stub whose `validateSource` always attests `connection`.
 *
 * `api` overrides what `getApi()` answers with. `null` — the default — is the "guard held"
 * probe: reaching `getApi` at all means the request got through, and it is the call that
 * mints a context-scoped token / drives the cross-document exchange.
 */
function createBus(connection: Partial<AppConnection>, api: unknown = null) {
	const responses: Response[] = []
	const handlers = new Map<string, (msg: unknown, source: unknown) => Promise<void>>()
	const getApi = jest.fn(() => api)

	const bus = {
		on(type: string, fn: (msg: unknown, source: unknown) => Promise<void>) {
			handlers.set(type, fn)
		},
		getAppTracker: () => ({
			validateSource: () => ({ access: 'write', initialized: true, ...connection }),
			// The embed-token store is real, so `resetAppTracker` clears it between tests.
			getEmbedToken: (fileId: string) => getAppTracker().getEmbedToken(fileId),
			storeEmbedToken: (fileId: string, token: string) =>
				getAppTracker().storeEmbedToken(fileId, token)
		}),
		getApi,
		setPendingRegistration: () => {},
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
	const any = bus as any
	initDocumentHandlers(any)
	initMediaHandlers(any)
	initEmbedHandlers(any)

	return {
		responses,
		getApi,
		async send(type: string, payload: Record<string, unknown> = {}) {
			await handlers.get(type)?.({ id: 1, payload }, {} as Window)
		}
	}
}

describe('the embed guard on the picker and nested-embed handlers', () => {
	let error: ReturnType<typeof jest.spyOn>
	let warn: ReturnType<typeof jest.spyOn>
	const picker = jest.fn()

	beforeEach(() => {
		resetAppTracker()
		error = jest.spyOn(console, 'error').mockImplementation(() => {})
		warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
		picker.mockClear()
		setDocPickerCallback(picker)
		setMediaPickerCallback(picker)
	})

	afterEach(() => {
		error.mockRestore()
		warn.mockRestore()
		setDocPickerCallback(null)
		setMediaPickerCallback(null)
		resetAppTracker()
	})

	/*
	 * Without the guard `handlers/document.ts` opens the shell's document picker over the
	 * reader's UI, then mints a context-scoped WRITE token for the tenant it read off
	 * `connection.resId` and creates an 'R' share on the picked file — targeting a fileId the
	 * embed supplied. It used to fail only by accident: `contextIdTag` resolved to the literal
	 * '_embed' and the mint threw.
	 */
	it('refuses doc:pick.req from an embed', async () => {
		const bus = createBus({ resId: 'victim.tld:f1~abc', embed: true })

		await bus.send('doc:pick.req', { sessionId: 's1' })

		expect(picker).not.toHaveBeenCalled()
		expect(bus.responses[0]).toMatchObject({
			type: 'doc:pick.ack',
			ok: false,
			error: 'Cannot pick a document from an embedded document'
		})
	})

	it('refuses media:pick.req from an embed', async () => {
		const bus = createBus({ resId: 'victim.tld:f1~abc', embed: true })

		await bus.send('media:pick.req', { sessionId: 's1' })

		expect(picker).not.toHaveBeenCalled()
		expect(bus.responses[0]).toMatchObject({
			type: 'media:pick.ack',
			ok: false,
			error: 'Cannot pick media from an embedded document'
		})
	})

	/*
	 * `handlers/embed.ts` derives its tenant the same way
	 * (`idTagFromResId(connection.resId) || connection.idTag || api.idTag`), so an embedded
	 * document could drive `auth.getAccessTokenVia` against a tenant it was never granted.
	 */
	it('refuses embed:open.req from an embed', async () => {
		const bus = createBus({ resId: 'victim.tld:f1~abc', embed: true })

		await bus.send('embed:open.req', {
			targetFileId: 'f2',
			targetContentType: 'cloudillo/quillo',
			sourceFileId: 'f1~abc'
		})

		expect(bus.getApi).not.toHaveBeenCalled()
		expect(bus.responses[0]).toMatchObject({
			type: 'embed:open.res',
			ok: false,
			error: 'Cannot embed from an embedded document'
		})
	})

	// The guard keys on the flag, not on the resId — an embed's resId is a real document.
	it.each([
		['doc:pick.req', 'doc:pick.ack'],
		['media:pick.req', 'media:pick.ack']
	])('lets a top-level app through %s', async (req, ack) => {
		const bus = createBus({ resId: 'victim.tld:f1~abc' })

		await bus.send(req, { sessionId: 's1' })

		expect(picker).toHaveBeenCalledTimes(1)
		expect(bus.responses.map((r) => r.error)).not.toContain(
			`Cannot pick a document from an embedded document`
		)
		expect(bus.responses[0]?.type ?? ack).toBeTruthy()
	})

	/*
	 * The bundle URL and the document tenant come from DIFFERENT nodes, and both halves
	 * are asserted here because the two are one line apart in `handlers/embed.ts` and the
	 * wrong one is always in scope: `contextIdTag` names the community node the document
	 * lives on, while the bundle is a static asset of the node serving *this* shell.
	 * Swapping them loads a community's bundle — or, on a node that has none, nothing.
	 */
	it('serves the bundle from the home node while the document stays on the context node', async () => {
		const api = {
			idTag: 'home.example',
			auth: { getAccessTokenVia: async () => ({ token: 't' }) }
		}
		// No `embed` flag, no `token`: `viaApi` stays `api` itself, so nothing here
		// reaches `createApiClient`.
		const bus = createBus({ resId: 'community.tld:f1' }, api)

		await bus.send('embed:open.req', {
			targetFileId: 'f2',
			targetContentType: 'cloudillo/quillo',
			sourceFileId: 'f1'
		})

		expect(bus.responses[0]).toMatchObject({
			type: 'embed:open.res',
			ok: true,
			data: {
				embedUrl: 'https://cl-o.home.example/apps/quillo/index.html',
				resId: 'community.tld:f2'
			}
		})
	})

	/*
	 * `targetContentType` is the embedding app's own string. Sliced rather than validated,
	 * its suffix would both frame an arbitrary path on the home API origin and become the
	 * `appName` handlers/settings.ts namespaces the user's per-app settings by.
	 */
	it('falls back to the viewer for a content type that could be read as a path', async () => {
		const api = {
			idTag: 'home.example',
			auth: { getAccessTokenVia: async () => ({ token: 't' }) }
		}
		const bus = createBus({ resId: 'community.tld:f1' }, api)

		await bus.send('embed:open.req', {
			targetFileId: 'f2',
			targetContentType: 'cloudillo/../../api/files/x',
			sourceFileId: 'f1'
		})

		expect(bus.responses[0]).toMatchObject({
			type: 'embed:open.res',
			ok: true,
			data: { embedUrl: 'https://cl-o.home.example/apps/view/index.html' }
		})
	})
})

/*
 * The per-handler guards above are a denylist: every handler added later is open to an
 * embed until somebody remembers. `ShellMessageBus.handleMessage` closes the surface at
 * the single dispatch gate instead, so an unguarded handler is unreachable by default.
 * `site:publish.req` is the live example — it gates on `appName === 'notillo'`, and a
 * LiveDocCard embedding a notillo document registers exactly that.
 */
describe('the dispatch gate on an embed connection', () => {
	const config = {
		getAccessToken: async () => undefined,
		getAuthState: () => null,
		getThemeState: () => ({ darkMode: false }),
		getLanguage: () => 'en'
	}

	let warn: ReturnType<typeof jest.spyOn>

	beforeEach(() => {
		resetAppTracker()
		warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
	})

	afterEach(() => {
		warn.mockRestore()
		resetAppTracker()
	})

	/** A registered, initialized connection plus a bus whose handlers are all spies. */
	function createBus(embed: boolean) {
		const bus = new ShellMessageBus(config)
		// What the gate itself answers with goes out through `postMessage`, not through a
		// handler — a refusal has to reach the app, or its request only times out.
		const sent: Array<Record<string, unknown>> = []
		const appWindow = {
			postMessage: (msg: Record<string, unknown>) => {
				sent.push(msg)
			}
		} as unknown as Window
		const connection = getAppTracker().registerApp({
			window: appWindow,
			appName: 'notillo',
			resId: 'victim.tld:f1~abc',
			embed
		})
		connection.initialized = true

		const handler = jest.fn(async () => {})
		bus.on('site:publish.req', handler)
		bus.on('crdt:clientid.req', handler)
		bus.on('settings:list.req', handler)

		return {
			handler,
			sent,
			deliver(message: Record<string, unknown>) {
				// `handleMessage` is the gate itself; jsdom's MessageEvent cannot carry a
				// plain object as `source`, so drive it with the event shape it reads.
				// biome-ignore lint/suspicious/noExplicitAny: reaching the private listener
				;(bus as any).handleMessage({ data: message, source: appWindow })
			}
		}
	}

	const publishReq = {
		cloudillo: true,
		v: 1,
		type: 'site:publish.req',
		id: 1,
		// `T.unknown` on `blob` refuses null, so a placeholder object it is — the
		// message has to actually decode or the drop below would prove nothing.
		payload: { blob: {}, docFileId: 'f1' }
	}

	it('drops site:publish.req from an embed', () => {
		const bus = createBus(true)

		bus.deliver(publishReq)

		expect(bus.handler).not.toHaveBeenCalled()
	})

	// Dropping the message silently costs the app its full 10s request timeout, which is
	// most of `useShellEmbed`'s 15s boot budget. The response type is derived from the
	// registry, so a `*.req` answered on an `.ack` is answered on its `.ack`.
	it('answers a refused request instead of leaving it pending', () => {
		const bus = createBus(true)

		bus.deliver(publishReq)

		expect(bus.sent).toEqual([
			expect.objectContaining({
				type: 'site:publish.res',
				replyTo: 1,
				ok: false,
				error: 'Not available to an embedded document'
			})
		])
	})

	it('still delivers site:publish.req from a top-level app', () => {
		const bus = createBus(false)

		bus.deliver(publishReq)

		expect(bus.handler).toHaveBeenCalledTimes(1)
	})

	// The embed's own document has to keep syncing, and `useShellEmbed`'s stage machine
	// runs on `app:ready.notify` — an allowlist that starved those would time out at 15s.
	it('lets an embed through on the messages it needs to display itself', () => {
		const bus = createBus(true)

		bus.deliver({
			cloudillo: true,
			v: 1,
			type: 'crdt:clientid.req',
			id: 1,
			payload: { docId: 'f1~abc' }
		})

		expect(bus.handler).toHaveBeenCalledTimes(1)
	})

	// mapillo awaits `bus.settings.list()` before it reports ready, so starving the
	// settings READS stalls the card until the request times out.
	it('lets an embed read its own app settings', () => {
		const bus = createBus(true)

		bus.deliver({
			cloudillo: true,
			v: 1,
			type: 'settings:list.req',
			id: 1,
			payload: {}
		})

		expect(bus.handler).toHaveBeenCalledTimes(1)
	})
})

// vim: ts=4
