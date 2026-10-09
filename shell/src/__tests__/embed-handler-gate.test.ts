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

import { EMBED_ERR_CYCLE, EMBED_ERR_DEPTH } from '@cloudillo/core'
import { jest } from '@jest/globals'

import { getAppTracker, resetAppTracker } from '../message-bus/app-tracker.js'
import {
	initDocumentHandlers,
	setDocGrantConfirm,
	setDocLinkConfirm,
	setDocOpenCallback,
	setDocPickerCallback
} from '../message-bus/handlers/document.js'
import { initEmbedHandlers } from '../message-bus/handlers/embed.js'
import { initMediaHandlers, setMediaPickerCallback } from '../message-bus/handlers/media.js'
import { ShellMessageBus } from '../message-bus/shell-bus.js'

type AppConnection = import('../message-bus/app-tracker.js').AppConnection
type EmbedTokenEntry = import('../message-bus/app-tracker.js').EmbedTokenEntry

/** Seed an embed instance of `fileId` under key `_embed:<nonce>` */
function seedEmbed(
	win: Window,
	nonce: string,
	fileId: string,
	access: 'read' | 'write' = 'read',
	ancestors = ['f1']
) {
	getAppTracker().storeEmbedToken(win, `_embed:${nonce}`, {
		fileId,
		token: `tok-${nonce}`,
		access,
		ancestors
	})
}

const relayedFrom = (nonce: string) => ({ relayed: true, relayedFrom: `_embed:${nonce}` })

/** Run `fn` with fetch stubbed offline, returning the URLs it was asked for */
async function captureFetch(fn: () => Promise<void>): Promise<string[]> {
	const urls: string[] = []
	const realFetch = globalThis.fetch
	globalThis.fetch = (async (url: string) => {
		urls.push(url)
		throw new Error('offline')
	}) as typeof fetch
	try {
		await fn()
	} finally {
		globalThis.fetch = realFetch
	}
	return urls.map((u) => decodeURIComponent(u))
}

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
function createBus(connection: Partial<AppConnection>, api: unknown = null, win = {} as Window) {
	const responses: Response[] = []
	const pending: unknown[] = []
	const handlers = new Map<string, (msg: unknown, source: unknown) => Promise<void>>()
	const getApi = jest.fn(() => api)

	const bus = {
		on(type: string, fn: (msg: unknown, source: unknown) => Promise<void>) {
			handlers.set(type, fn)
		},
		getAppTracker: () => ({
			validateSource: () => ({ access: 'write', initialized: true, ...connection }),
			// The embed-token store is real, so `resetAppTracker` clears it between tests.
			getEmbedToken: (window: Window, key: string) =>
				getAppTracker().getEmbedToken(window, key),
			storeEmbedToken: (window: Window, key: string, entry: EmbedTokenEntry) =>
				getAppTracker().storeEmbedToken(window, key, entry),
			hasEmbed: (window: Window, fileId: string, parentFileId?: string) =>
				getAppTracker().hasEmbed(window, fileId, parentFileId)
		}),
		getApi,
		setPendingRegistration: (_key: string, reg: unknown) => {
			pending.push(reg)
		},
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
		pending,
		getApi,
		win,
		async send(
			type: string,
			payload: Record<string, unknown> = {},
			extra: Record<string, unknown> = {}
		) {
			await handlers.get(type)?.({ id: 1, payload, ...extra }, win)
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

	// An embed upgrading its own host's link to itself would be self-granted write access.
	it('refuses doc:grant.req from an embed', async () => {
		const bus = createBus({ resId: 'victim.tld:f2', embed: true })

		await bus.send('doc:grant.req', { targetFileId: 'f1', sourceFileId: 'f2', access: 'write' })

		expect(bus.getApi).not.toHaveBeenCalled()
		expect(bus.responses[0]).toMatchObject({ type: 'doc:grant.res', ok: false })
	})

	// The backend caps at the viewer's level on the host and downgrades silently.
	it('registers the granted access, not the requested one', async () => {
		const api = {
			idTag: 'home.example',
			auth: { getAccessTokenVia: async () => ({ token: 't', accessLevel: 'read' }) }
		}
		const bus = createBus({ resId: 'home.example:f1' }, api)

		await bus.send('embed:open.req', {
			targetFileId: 'f2',
			targetContentType: 'cloudillo/calcillo',
			sourceFileId: 'f1',
			access: 'write'
		})

		expect(bus.pending[0]).toMatchObject({ access: 'read' })
	})

	it('refuses embed:open.req for a source that is not the connection document', async () => {
		const api = { idTag: 'home.example', auth: { getAccessTokenVia: jest.fn() } }
		const bus = createBus({ resId: 'home.example:f1' }, api)

		await bus.send('embed:open.req', {
			targetFileId: 'f2',
			targetContentType: 'cloudillo/quillo',
			sourceFileId: 'other'
		})

		expect(api.auth.getAccessTokenVia).not.toHaveBeenCalled()
		expect(bus.responses[0]).toMatchObject({ type: 'embed:open.res', ok: false })
	})

	it('asks only for read access from a read connection', async () => {
		const getAccessTokenVia = jest.fn(async () => ({ token: 't' }))
		const api = { idTag: 'home.example', auth: { getAccessTokenVia } }
		const bus = createBus({ resId: 'home.example:f1', access: 'read' }, api)

		await bus.send('embed:open.req', {
			targetFileId: 'f2',
			targetContentType: 'cloudillo/quillo',
			sourceFileId: 'f1',
			access: 'write'
		})

		expect(getAccessTokenVia).toHaveBeenCalledWith('f1', expect.stringMatching(/^file:f2:R/))
	})

	// quillo sends its own document as `owner:fileId`
	it('accepts an owner-prefixed sourceFileId for the connection document', async () => {
		const getAccessTokenVia = jest.fn(async () => ({ token: 't', accessLevel: 'read' }))
		const api = { idTag: 'home.example', auth: { getAccessTokenVia } }
		const bus = createBus({ resId: 'home.example:f1' }, api)

		await bus.send('embed:open.req', {
			targetFileId: 'f2',
			targetContentType: 'cloudillo/quillo',
			sourceFileId: 'home.example:f1'
		})

		expect(getAccessTokenVia).toHaveBeenCalledWith('f1', expect.any(String))
		expect(bus.responses[0]).toMatchObject({ type: 'embed:open.res', ok: true })
	})

	it('refuses a source embedded by another connection (no borrowing its token)', async () => {
		seedEmbed({} as Window, 'n1', 'f9', 'write')
		const api = { idTag: 'home.example', auth: { getAccessTokenVia: jest.fn() } }
		const bus = createBus({ resId: 'home.example:f1' }, api)

		await bus.send(
			'embed:open.req',
			{ targetFileId: 'f2', targetContentType: 'cloudillo/quillo', sourceFileId: 'f9' },
			relayedFrom('n1')
		)

		expect(api.auth.getAccessTokenVia).not.toHaveBeenCalled()
		expect(bus.responses[0]).toMatchObject({ type: 'embed:open.res', ok: false })
	})

	// A relayed nested embed inherits its own parent instance's access — not the host's write,
	// nor a sibling instance's write on the same document
	it('caps a relayed embed at the access stored for its instance', async () => {
		const bus = createBus({ resId: 'home.example:f1' }, { idTag: 'home.example' })
		seedEmbed(bus.win, 'n1', 'f9', 'read')
		seedEmbed(bus.win, 'n2', 'f9', 'write')

		// The via-token path builds its own api client, so observe the request it sends
		const urls = await captureFetch(() =>
			bus.send(
				'embed:open.req',
				{
					targetFileId: 'f2',
					targetContentType: 'cloudillo/quillo',
					sourceFileId: 'f9',
					access: 'write'
				},
				relayedFrom('n1')
			)
		)

		expect(urls).toHaveLength(1)
		expect(urls[0]).toMatch(/via=f9&scope=file:f2:R/)
	})

	// The source is the stamped instance's document, so a child cannot name a sibling's
	it("refuses a relayed embed:open.req naming a sibling embed's document", async () => {
		const bus = createBus({ resId: 'home.example:f1' }, { idTag: 'home.example' })
		seedEmbed(bus.win, 'n1', 'f9', 'read')
		seedEmbed(bus.win, 'n2', 'f8', 'write')

		const urls = await captureFetch(() =>
			bus.send(
				'embed:open.req',
				{ targetFileId: 'f2', targetContentType: 'cloudillo/quillo', sourceFileId: 'f8' },
				relayedFrom('n1')
			)
		)

		expect(urls).toHaveLength(0)
		expect(bus.responses[0]).toMatchObject({ ok: false, error: 'Not allowed' })
	})

	// The chain comes from the stored instance, not the request
	it('ignores a forged empty ancestors list on the depth check', async () => {
		const bus = createBus({ resId: 'home.example:f1' }, { idTag: 'home.example' })
		seedEmbed(bus.win, 'n1', 'f9', 'write', ['f0', 'f1'])

		await bus.send(
			'embed:open.req',
			{
				targetFileId: 'f2',
				targetContentType: 'cloudillo/quillo',
				sourceFileId: 'f9',
				ancestors: []
			},
			relayedFrom('n1')
		)

		expect(bus.responses[0]).toMatchObject({ ok: false, error: EMBED_ERR_DEPTH })
	})

	it('stores the instance with its ancestor chain', async () => {
		const api = {
			idTag: 'home.example',
			auth: { getAccessTokenVia: async () => ({ token: 't', accessLevel: 'write' }) }
		}
		const bus = createBus({ resId: 'home.example:f1' }, api)

		await bus.send('embed:open.req', {
			targetFileId: 'f2',
			targetContentType: 'cloudillo/quillo',
			sourceFileId: 'f1'
		})

		const nonce = bus.responses[0].data?.nonce as string
		expect(getAppTracker().getEmbedToken(bus.win, `_embed:${nonce}`)).toEqual({
			fileId: 'f2',
			token: 't',
			access: 'write',
			ancestors: ['f1']
		})
	})

	// The relay stamps `relayed`: a child naming the host's document must not get the host's token
	it("refuses a relayed embed:open.req naming the host's own document", async () => {
		const bus = createBus({ resId: 'home.example:f1' })

		await bus.send(
			'embed:open.req',
			{ targetFileId: 'f2', targetContentType: 'cloudillo/quillo', sourceFileId: 'f1' },
			{ relayed: true }
		)

		expect(bus.getApi).not.toHaveBeenCalled()
		expect(bus.responses[0]).toMatchObject({ ok: false, error: 'Not allowed' })
	})

	// The cycle check compares bare fileIds: an `owner:fileId` target is still the host itself
	it('refuses an owner-prefixed target that is the source document', async () => {
		const bus = createBus({ resId: 'home.example:f1' })

		await bus.send('embed:open.req', {
			targetFileId: 'home.example:f1',
			targetContentType: 'cloudillo/quillo',
			sourceFileId: 'f1'
		})

		expect(bus.getApi).not.toHaveBeenCalled()
		expect(bus.responses[0]).toMatchObject({ ok: false, error: EMBED_ERR_CYCLE })
	})

	// A grant is only for a document the host embedded (embed:open.req stored its token)
	it('refuses doc:grant.req for a document the connection has not embedded', async () => {
		const bus = createBus({ resId: 'home.example:f1' })

		await bus.send('doc:grant.req', { targetFileId: 'f2', sourceFileId: 'f1', access: 'write' })

		expect(bus.getApi).not.toHaveBeenCalled()
		expect(bus.responses[0]).toMatchObject({ ok: false, error: 'Not embedded' })
	})

	it('lets doc:grant.req through for an embedded document', async () => {
		const bus = createBus({ resId: 'home.example:f1' })
		seedEmbed(bus.win, 'n1', 'f2')

		await bus.send('doc:grant.req', { targetFileId: 'f2', sourceFileId: 'f1', access: 'write' })

		expect(bus.getApi).toHaveBeenCalled()
	})

	// quillo sends its own document as `owner:fileId`
	it('accepts an owner-prefixed sourceFileId on doc:grant.req', async () => {
		const bus = createBus({ resId: 'home.example:f1' })
		seedEmbed(bus.win, 'n1', 'f2')

		await bus.send('doc:grant.req', {
			targetFileId: 'f2',
			sourceFileId: 'home.example:f1',
			access: 'write'
		})

		expect(bus.getApi).toHaveBeenCalled()
	})

	// The picker creates a share from `sourceFileId`: only from a document this caller may write
	it.each([
		['a foreign source', { resId: 'home.example:f1' }, 'other', {}],
		['a read-only connection', { resId: 'home.example:f1', access: 'read' }, 'f1', {}],
		['a read embed instance', { resId: 'home.example:f1' }, 'f9', relayedFrom('n1')],
		['a sibling instance', { resId: 'home.example:f1' }, 'f8', relayedFrom('n1')]
	] as const)('refuses doc:pick.req sharing from %s', async (_, conn, sourceFileId, extra) => {
		const bus = createBus(conn as Partial<AppConnection>)
		seedEmbed(bus.win, 'n1', 'f9', 'read')
		seedEmbed(bus.win, 'n2', 'f8', 'write')

		await bus.send('doc:pick.req', { sessionId: 's1', sourceFileId }, extra)

		expect(picker).not.toHaveBeenCalled()
		expect(bus.responses[0]).toMatchObject({ type: 'doc:pick.ack', ok: false })
	})

	it('lets doc:pick.req share from a write embed instance', async () => {
		const bus = createBus({ resId: 'home.example:f1' })
		seedEmbed(bus.win, 'n2', 'f8', 'write')

		await bus.send('doc:pick.req', { sessionId: 's1', sourceFileId: 'f8' }, relayedFrom('n2'))

		expect(picker).toHaveBeenCalledTimes(1)
	})

	// "Open source" runs from a click in this app; without one an app may not navigate the shell
	it.each([
		[false, true, 0],
		[true, false, 0],
		[true, true, 1]
	])(
		'doc:open.push with user activation %s, focused %s navigates %i times',
		async (isActive, focused, calls) => {
			const open = jest.fn()
			setDocOpenCallback(open)
			Object.defineProperty(navigator, 'userActivation', {
				value: { isActive },
				configurable: true
			})
			// A node environment: stub just the focus probe the handler reads
			class HTMLIFrameElement {
				contentWindow = {} as Window
			}
			const iframe = new HTMLIFrameElement()
			const g = globalThis as Record<string, unknown>
			g.HTMLIFrameElement = HTMLIFrameElement
			g.document = { activeElement: focused ? iframe : null }
			const bus = createBus({ resId: 'home.example:f1' }, null, iframe.contentWindow)
			seedEmbed(bus.win, 'n1', 'f2')

			try {
				await bus.send('doc:open.push', { ref: 'cl:quillo/home.example:f2' })
			} finally {
				setDocOpenCallback(null)
				delete g.HTMLIFrameElement
				delete g.document
			}

			expect(open).toHaveBeenCalledTimes(calls)
		}
	)

	// Only an embed's source may be opened, not any document the app names
	it('ignores doc:open.push for a document the app has not embedded', async () => {
		const open = jest.fn()
		setDocOpenCallback(open)
		Object.defineProperty(navigator, 'userActivation', {
			value: { isActive: true },
			configurable: true
		})
		class HTMLIFrameElement {
			contentWindow = {} as Window
		}
		const iframe = new HTMLIFrameElement()
		const g = globalThis as Record<string, unknown>
		g.HTMLIFrameElement = HTMLIFrameElement
		g.document = { activeElement: iframe }
		const bus = createBus({ resId: 'home.example:f1' }, null, iframe.contentWindow)
		seedEmbed(bus.win, 'n1', 'f3')

		try {
			await bus.send('doc:open.push', { ref: 'cl:quillo/home.example:f2' })
		} finally {
			setDocOpenCallback(null)
			delete g.HTMLIFrameElement
			delete g.document
		}

		expect(open).not.toHaveBeenCalled()
	})

	// Not in RELAY_UP_TYPES, so a relayed grant is forged: even a write instance may not grant
	it('refuses a relayed doc:grant.req', async () => {
		const bus = createBus({ resId: 'home.example:f1' })
		seedEmbed(bus.win, 'n1', 'f2', 'write')
		seedEmbed(bus.win, 'n2', 'f3', 'read', ['f1', 'f2'])

		await bus.send(
			'doc:grant.req',
			{ targetFileId: 'f3', sourceFileId: 'f2', access: 'write' },
			relayedFrom('n1')
		)

		expect(bus.getApi).not.toHaveBeenCalled()
		expect(bus.responses[0]).toMatchObject({ ok: false, error: 'Not allowed' })
	})

	// Embedded somewhere down the tree is not embedded into the granting document
	it('refuses doc:grant.req for a document embedded under another parent', async () => {
		const bus = createBus({ resId: 'home.example:f1' })
		seedEmbed(bus.win, 'n1', 'f2', 'read', ['f1', 'f9'])

		await bus.send('doc:grant.req', { targetFileId: 'f2', sourceFileId: 'f1', access: 'write' })

		expect(bus.getApi).not.toHaveBeenCalled()
		expect(bus.responses[0]).toMatchObject({ ok: false, error: 'Not embedded' })
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

type Share = { id: number; subjectType: string; subjectId: string; permission: string }

/** An api on the context node itself, so `getContextApi` hands it back unchanged */
function fakeApi(shares: Share[] = [], meta: Record<string, unknown> = {}) {
	return {
		idTag: 'home.example',
		files: {
			getMetadata: jest.fn(async (fileId: string) => ({
				fileId,
				fileName: `${fileId}.doc`,
				contentType: 'cloudillo/quillo',
				...meta
			})),
			listShares: jest.fn(async (_entryId: string) => shares),
			createShare: jest.fn(async (_entryId: string, _share: unknown) => ({})),
			updateShare: jest.fn(async (_entryId: string, _id: number, _patch: unknown) => ({}))
		}
	}
}

const writeShare: Share = { id: 7, subjectType: 'F', subjectId: 'f1', permission: 'W' }

describe('doc:link.req and the file-link share', () => {
	let warn: ReturnType<typeof jest.spyOn>
	const confirm = jest.fn(async (_name: string, _host?: string) => true)

	beforeEach(() => {
		resetAppTracker()
		warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
		confirm.mockClear()
		confirm.mockImplementation(async () => true)
		setDocLinkConfirm(confirm)
		setDocGrantConfirm(confirm)
	})

	afterEach(() => {
		warn.mockRestore()
		setDocLinkConfirm(null)
		setDocGrantConfirm(null)
		resetAppTracker()
	})

	const link = { sourceFileId: 'f1', ref: 'cl:quillo/home.example:f2' }

	it.each([
		['a read-only connection', { access: 'read' }, link, 'Not allowed'],
		['another source document', {}, { ...link, sourceFileId: 'f9' }, 'Not allowed'],
		[
			'a foreign context',
			{},
			{ ...link, ref: 'cl:quillo/other.tld:f2' },
			'Only documents from this context can be embedded'
		],
		['a non-document link', {}, { ...link, ref: 'https://x' }, 'Not a document link']
	] as const)('refuses linking from %s', async (_, conn, payload, error) => {
		const api = fakeApi()
		const bus = createBus({ resId: 'home.example:f1', ...conn }, api)

		await bus.send('doc:link.req', payload)

		expect(bus.responses[0]).toMatchObject({ type: 'doc:link.res', ok: false, error })
		expect(api.files.createShare).not.toHaveBeenCalled()
	})

	it('refuses a document that cannot be embedded', async () => {
		const api = fakeApi([], { contentType: 'text/plain' })
		const bus = createBus({ resId: 'home.example:f1' }, api)

		await bus.send('doc:link.req', link)

		expect(bus.responses[0]).toMatchObject({ ok: false, error: 'Not embeddable' })
		expect(api.files.createShare).not.toHaveBeenCalled()
	})

	it('refuses without a disclosure prompt', async () => {
		setDocLinkConfirm(null)
		const api = fakeApi()
		const bus = createBus({ resId: 'home.example:f1' }, api)

		await bus.send('doc:link.req', link)

		expect(bus.responses[0]).toMatchObject({ ok: false, error: 'Disclosure not available' })
		expect(api.files.createShare).not.toHaveBeenCalled()
	})

	it('answers a cancelled disclosure with ok and no document', async () => {
		confirm.mockImplementation(async () => false)
		const api = fakeApi()
		const bus = createBus({ resId: 'home.example:f1' }, api)

		await bus.send('doc:link.req', link)

		expect(bus.responses[0]).toMatchObject({ ok: true, data: undefined })
		expect(api.files.createShare).not.toHaveBeenCalled()
	})

	// A public file is still disclosed: the share outlives a later visibility change
	it.each([undefined, 'P'])('shares after the disclosure (visibility %s)', async (visibility) => {
		const api = fakeApi([], { visibility })
		const bus = createBus({ resId: 'home.example:f1' }, api)

		await bus.send('doc:link.req', link)

		expect(confirm).toHaveBeenCalledWith('f2.doc')
		expect(api.files.createShare).toHaveBeenCalledWith('f2', {
			subjectType: 'F',
			subjectId: 'f1',
			permission: 'R'
		})
		expect(bus.responses[0]).toMatchObject({
			ok: true,
			data: { fileId: 'f2', appId: 'quillo', fileName: 'f2.doc' }
		})
	})

	it('does not downgrade an existing write share on re-linking', async () => {
		const api = fakeApi([writeShare])
		const bus = createBus({ resId: 'home.example:f1' }, api)

		await bus.send('doc:link.req', link)

		expect(api.files.updateShare).not.toHaveBeenCalled()
		expect(api.files.createShare).not.toHaveBeenCalled()
		expect(bus.responses[0]).toMatchObject({ ok: true })
	})

	async function grant(access: 'read' | 'write', shares: Share[]) {
		const api = fakeApi(shares)
		const bus = createBus({ resId: 'home.example:f1' }, api)
		seedEmbed(bus.win, 'n1', 'f2')
		await bus.send('doc:grant.req', { targetFileId: 'f2', sourceFileId: 'f1', access })
		return { api, bus }
	}

	it('creates a write share on a write grant', async () => {
		const { api, bus } = await grant('write', [])

		expect(api.files.createShare).toHaveBeenCalledWith('f2', {
			subjectType: 'F',
			subjectId: 'f1',
			permission: 'W'
		})
		expect(bus.responses[0]).toMatchObject({ type: 'doc:grant.res', ok: true })
	})

	// Creating a share is doc:link's job, behind its disclosure
	it('does not create a share on a read grant', async () => {
		const { api, bus } = await grant('read', [])

		expect(api.files.createShare).not.toHaveBeenCalled()
		expect(bus.responses[0]).toMatchObject({ ok: true })
	})

	it('downgrades an existing write share on a read grant', async () => {
		const { api } = await grant('read', [writeShare])

		expect(api.files.updateShare).toHaveBeenCalledWith('f2', 7, { permission: 'R' })
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
