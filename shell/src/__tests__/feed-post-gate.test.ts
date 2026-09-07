// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Who may ask the shell to share the document they are showing as a feed post.
 *
 * Fulfilling `feed:post.req` navigates the shell to the composer, which unmounts the
 * requesting iframe — so an embed, which is an inline preview sitting *inside* somebody
 * else's page, must never reach it. And the document acted on comes from the attested
 * connection, never from the payload: the message carries no fileId at all.
 */

import { jest } from '@jest/globals'

import type { FeedPostRequest } from '../message-bus/handlers/feed.js'
import { initFeedHandlers, setFeedPostCallback } from '../message-bus/handlers/feed.js'

type AppConnection = import('../message-bus/app-tracker.js').AppConnection

interface Response {
	type: string
	ok: boolean
	error?: string
}

/** `undefined` stands for a source `validateSource` refuses — uninitialized or unknown. */
function createBus(connection: Partial<AppConnection> | undefined) {
	const responses: Response[] = []
	const handlers = new Map<string, (msg: unknown, source: unknown) => Promise<void>>()

	const bus = {
		on(type: string, fn: (msg: unknown, source: unknown) => Promise<void>) {
			handlers.set(type, fn)
		},
		getAppTracker: () => ({
			validateSource: () =>
				connection && { access: 'write', initialized: true, ...connection }
		}),
		sendResponse: (
			_win: unknown,
			type: string,
			_id: unknown,
			ok: boolean,
			_data?: Record<string, unknown>,
			error?: string
		) => {
			responses.push({ type, ok, error })
		}
	}

	// biome-ignore lint/suspicious/noExplicitAny: the stub is a deliberate subset
	initFeedHandlers(bus as any)

	return {
		responses,
		async post() {
			await handlers.get('feed:post.req')?.({ id: 1 }, {} as Window)
		}
	}
}

describe('feed:post.req — the share gate', () => {
	let error: ReturnType<typeof jest.spyOn>
	let warn: ReturnType<typeof jest.spyOn>

	beforeEach(() => {
		error = jest.spyOn(console, 'error').mockImplementation(() => {})
		warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
	})

	afterEach(() => {
		error.mockRestore()
		warn.mockRestore()
		setFeedPostCallback(null)
	})

	it('refuses an embed connection', async () => {
		// An embed's resId IS a real document since `handlers/auth.ts` registers it on the
		// attested pending resId — so only the `embed` flag can tell the two apart.
		const callback = jest.fn(async () => {})
		setFeedPostCallback(callback)
		const bus = createBus({ resId: 'comm.tld:f1~abc', embed: true })

		await bus.post()

		expect(callback).not.toHaveBeenCalled()
		expect(bus.responses[0]).toMatchObject({
			type: 'feed:post.res',
			ok: false,
			error: 'Cannot share from an embedded document'
		})
	})

	it('refuses an uninitialized or unknown source', async () => {
		const callback = jest.fn(async () => {})
		setFeedPostCallback(callback)
		const bus = createBus(undefined)

		await bus.post()

		expect(callback).not.toHaveBeenCalled()
		expect(bus.responses[0]).toMatchObject({
			type: 'feed:post.res',
			ok: false,
			error: 'App not initialized'
		})
	})

	it('refuses when no composer is mounted to receive the document', async () => {
		const bus = createBus({ resId: 'comm.tld:f1~abc' })

		await bus.post()

		expect(bus.responses[0]).toMatchObject({
			type: 'feed:post.res',
			ok: false,
			error: 'Sharing to the feed is not available'
		})
	})

	it('takes the document from the connection, never from the payload', async () => {
		const seen: FeedPostRequest[] = []
		setFeedPostCallback(async (req) => {
			seen.push(req)
		})
		const bus = createBus({ resId: 'comm.tld:f1~abc' })

		await bus.post()

		expect(seen).toEqual([{ srcIdTag: 'comm.tld', fileId: 'f1~abc' }])
		expect(bus.responses[0]).toMatchObject({ type: 'feed:post.res', ok: true })
	})

	it("surfaces a rejecting composer's own message", async () => {
		// `FeedPostHost` throws this for a document with no local row, a mirrored row, or one
		// the viewer cannot write (`resolveDocInfo().canPost` — see `doc-info.test.ts`). The
		// DocBar hides its button on the same predicate, but the bus is the trust boundary.
		setFeedPostCallback(async () => {
			throw new Error('Cannot share this document')
		})
		const bus = createBus({ resId: 'comm.tld:f1~abc' })

		await bus.post()

		expect(bus.responses[0]).toMatchObject({
			type: 'feed:post.res',
			ok: false,
			error: 'Cannot share this document'
		})
	})

	it('refuses a connection whose resId is not "<idTag>:<fileId>"', async () => {
		const callback = jest.fn(async () => {})
		setFeedPostCallback(callback)
		const bus = createBus({ resId: 'nocolon' })

		await bus.post()

		expect(callback).not.toHaveBeenCalled()
		expect(bus.responses[0]).toMatchObject({
			type: 'feed:post.res',
			ok: false,
			error: 'Cannot determine resource ID'
		})
	})
})

// vim: ts=4
