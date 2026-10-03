// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Who may hand the shell a site container, and whose tenant it lands on.
 *
 * `site:publish.req` uploads bytes that are then served as HTML from the site
 * owner's own origin, and every guard that makes those bytes safe runs inside the
 * publishing iframe. Until apps carry declared permissions, both handlers answer
 * only to the app that owns the site document format, and publishing additionally
 * only over a connection with write access — these are those locks.
 *
 * The other half is *which* tenant is acted on: `api.site.*` is tenant-relative, so a
 * document owned by a community has to be published through the community's client.
 * The owner half of the attested `resId` is the only value in these exchanges that
 * names it.
 */

import { jest } from '@jest/globals'

const getApiClient = jest.fn()
const hasApiToken = jest.fn()

// The active context's registry key; identity unless a test puts on a hat.
const activeKeyFor = jest.fn((_store: unknown, idTag: string) => idTag)

jest.unstable_mockModule('@cloudillo/core', () => ({ getApiClient, hasApiToken }))
jest.unstable_mockModule('../context/trust-gate.js', () => ({ activeKeyFor }))

const { initSiteHandlers } = await import('../message-bus/handlers/site.js')

type AppConnection = import('../message-bus/app-tracker.js').AppConnection

const OWNER = 'me.example.com'
const RES_ID = `${OWNER}:f1~abc`
const COMMUNITY = 'comm.tld'

interface Response {
	type: string
	ok: boolean
	data?: Record<string, unknown>
	error?: string
}

/** One tenant's `ApiClient`, reduced to the two calls these handlers make. */
function createClient(idTag: string, mountPath = '/blog') {
	const uploads: string[] = []
	const published: unknown[] = []
	return {
		idTag,
		uploads,
		published,
		files: {
			uploadBlob: jest.fn(async (_preset: string, fileName: string) => {
				uploads.push(fileName)
				return { fileId: `c1~${idTag}` }
			})
		},
		site: {
			publish: jest.fn(async (arg: unknown) => {
				published.push(arg)
				return undefined
			}),
			get: jest.fn(async () => ({
				docs: [{ docFileId: 'f1~abc', mountPath }]
			}))
		}
	}
}

function createBus(connection: Partial<AppConnection>) {
	const responses: Response[] = []
	const handlers = new Map<string, (msg: unknown, source: unknown) => Promise<void>>()
	// The signed-in user's own client, which `bus.getApi()` answers with. Nothing a
	// document owned by somebody else may reach.
	const personal = createClient('someone-else.example.com', '/')

	const bus = {
		on(type: string, fn: (msg: unknown, source: unknown) => Promise<void>) {
			handlers.set(type, fn)
		},
		getAppTracker: () => ({
			validateSource: () => ({ access: 'write', initialized: true, ...connection })
		}),
		getApi: () => personal,
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
	initSiteHandlers(bus as any)

	return {
		responses,
		personal,
		async publish(docFileId = 'f1~abc') {
			await handlers.get('site:publish.req')?.(
				{ id: 1, payload: { docFileId, blob: new Blob(['zip']) } },
				{} as Window
			)
		},
		async mount(docFileId = 'f1~abc') {
			await handlers.get('site:mount.req')?.({ id: 2, payload: { docFileId } }, {} as Window)
		}
	}
}

describe('site handlers — the app gate', () => {
	let error: ReturnType<typeof jest.spyOn>
	let log: ReturnType<typeof jest.spyOn>

	beforeEach(() => {
		error = jest.spyOn(console, 'error').mockImplementation(() => {})
		log = jest.spyOn(console, 'log').mockImplementation(() => {})
		getApiClient.mockReset()
		hasApiToken.mockReset()
		hasApiToken.mockReturnValue(true)
	})

	afterEach(() => {
		error.mockRestore()
		log.mockRestore()
	})

	it('refuses an app that is not a site publisher', async () => {
		const client = createClient(OWNER)
		getApiClient.mockReturnValue(client)
		const bus = createBus({ appName: 'quillo', resId: RES_ID })

		await bus.publish()

		expect(client.files.uploadBlob).not.toHaveBeenCalled()
		expect(bus.responses[0]).toMatchObject({
			type: 'site:publish.res',
			ok: false,
			error: 'This app may not publish a site'
		})
	})

	it('refuses a non-publisher on the mount lookup too', async () => {
		// The mount table is `require_leader` site configuration; answering an
		// arbitrary iframe with where a tenant serves a document is a read off it.
		const client = createClient(OWNER)
		getApiClient.mockReturnValue(client)
		const bus = createBus({ appName: 'quillo', resId: RES_ID })

		await bus.mount()

		expect(client.site.get).not.toHaveBeenCalled()
		expect(bus.responses[0]).toMatchObject({
			type: 'site:mount.res',
			ok: false,
			error: 'This app may not read the site mount'
		})
	})

	it('refuses a connection with no attested app name', async () => {
		getApiClient.mockReturnValue(createClient(OWNER))
		const bus = createBus({ resId: RES_ID })

		await bus.publish()

		expect(bus.responses[0]?.ok).toBe(false)
	})

	it('refuses a read-only connection, publisher or not', async () => {
		const client = createClient(OWNER)
		getApiClient.mockReturnValue(client)
		const bus = createBus({ appName: 'notillo', resId: RES_ID, access: 'read' })

		await bus.publish()

		expect(client.files.uploadBlob).not.toHaveBeenCalled()
		expect(bus.responses[0]).toMatchObject({
			type: 'site:publish.res',
			ok: false,
			error: 'Read-only access'
		})
	})

	it('answers a read-only connection on the mount lookup', async () => {
		// Resolving the mount is how the publisher decides whether to *offer*
		// publishing at all, and it does that on load from a read-only mount.
		const client = createClient(OWNER)
		getApiClient.mockReturnValue(client)
		const bus = createBus({ appName: 'notillo', resId: RES_ID, access: 'read' })

		await bus.mount()

		expect(bus.responses[0]).toMatchObject({
			type: 'site:mount.res',
			ok: true,
			data: { mountPath: '/blog', mounted: true }
		})
	})

	it('uploads for the publisher over a write connection', async () => {
		const client = createClient(OWNER)
		getApiClient.mockReturnValue(client)
		const bus = createBus({ appName: 'notillo', resId: RES_ID, access: 'write' })

		await bus.publish()

		expect(client.uploads).toEqual(['site-f1~abc.zip'])
		expect(bus.responses[0]).toMatchObject({
			type: 'site:publish.res',
			ok: true,
			data: { containerFileId: `c1~${OWNER}` }
		})
	})
})

describe('site handlers — whose tenant is acted on', () => {
	let error: ReturnType<typeof jest.spyOn>
	let log: ReturnType<typeof jest.spyOn>

	beforeEach(() => {
		error = jest.spyOn(console, 'error').mockImplementation(() => {})
		log = jest.spyOn(console, 'log').mockImplementation(() => {})
		getApiClient.mockReset()
		hasApiToken.mockReset()
		hasApiToken.mockReturnValue(true)
	})

	afterEach(() => {
		error.mockRestore()
		log.mockRestore()
	})

	it("publishes through the resId owner's client, not the signed-in user's", async () => {
		// `bus.getApi()` is a bare `useApi()` — always the personal tenant. A
		// community document used to upload and commit there, leaving a stray
		// managed container on the user's own node on every attempt.
		const community = createClient(COMMUNITY)
		getApiClient.mockReturnValue(community)
		const bus = createBus({
			appName: 'notillo',
			resId: `${COMMUNITY}:f1~abc`,
			access: 'write',
			// Deliberately the signed-in user, which is what the pending
			// registration records. It must not be what picks the client.
			idTag: 'someone-else.example.com'
		})

		await bus.publish()

		expect(getApiClient).toHaveBeenCalledWith(COMMUNITY)
		expect(community.uploads).toEqual(['site-f1~abc.zip'])
		expect(community.published).toEqual([
			{ docFileId: 'f1~abc', containerFileId: `c1~${COMMUNITY}` }
		])
		expect(bus.personal.files.uploadBlob).not.toHaveBeenCalled()
		expect(bus.personal.site.publish).not.toHaveBeenCalled()
	})

	it("answers the mount lookup from the resId owner's site", async () => {
		const community = createClient(COMMUNITY, '/news')
		getApiClient.mockReturnValue(community)
		const bus = createBus({
			appName: 'notillo',
			resId: `${COMMUNITY}:f1~abc`,
			access: 'write',
			idTag: 'someone-else.example.com'
		})

		await bus.mount()

		expect(getApiClient).toHaveBeenCalledWith(COMMUNITY)
		expect(bus.personal.site.get).not.toHaveBeenCalled()
		expect(bus.responses[0]).toMatchObject({
			type: 'site:mount.res',
			ok: true,
			data: { mountPath: '/news', mounted: true }
		})
	})

	it('publishes as the hat worn in the owner community', async () => {
		const hatted = `${COMMUNITY}|hat.tld`
		activeKeyFor.mockImplementation((_store, idTag) => (idTag === COMMUNITY ? hatted : idTag))
		const community = createClient(COMMUNITY)
		getApiClient.mockReturnValue(community)
		const bus = createBus({
			appName: 'notillo',
			resId: `${COMMUNITY}:f1~abc`,
			access: 'write',
			idTag: 'someone-else.example.com'
		})

		await bus.publish()
		activeKeyFor.mockImplementation((_store, idTag) => idTag)

		expect(hasApiToken).toHaveBeenCalledWith(hatted)
		expect(getApiClient).toHaveBeenCalledWith(hatted)
		expect(community.uploads).toEqual(['site-f1~abc.zip'])
	})

	it('fails rather than falling back when the owner has no token', async () => {
		hasApiToken.mockReturnValue(false)
		const bus = createBus({
			appName: 'notillo',
			resId: `${COMMUNITY}:f1~abc`,
			access: 'write'
		})

		await bus.publish()

		expect(getApiClient).not.toHaveBeenCalled()
		expect(bus.personal.files.uploadBlob).not.toHaveBeenCalled()
		expect(bus.responses[0]).toMatchObject({
			type: 'site:publish.res',
			ok: false,
			error: 'Not authenticated'
		})
	})

	it('refuses an embed connection, whose resId names no document', async () => {
		// `_embed:<nonce>` is a handshake key, not an `<ownerTag>:<fileId>`. An
		// embedded viewer must not publish the site it is being read from.
		const bus = createBus({
			appName: 'notillo',
			resId: '_embed:n0nce',
			access: 'write'
		})

		await bus.publish()

		expect(getApiClient).not.toHaveBeenCalled()
		expect(bus.responses[0]).toMatchObject({
			type: 'site:publish.res',
			ok: false,
			error: 'Publish request does not match the open document'
		})
	})
})

// vim: ts=4
