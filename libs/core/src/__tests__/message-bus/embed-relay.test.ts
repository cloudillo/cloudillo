// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * What a nested embed is allowed to say to the shell through its host.
 *
 * The relay reposts from the HOST app's window, so the shell sees the host as
 * the sender and answers every connection-scoped request against the HOST's
 * connection — its resId, its appName, its token. An unfiltered relay therefore
 * lets a foreign-owned embedded document act as the document it is embedded in;
 * `doc:rename.req` is the case that renames its host.
 */

import { setupEmbedRelay } from '../../message-bus/embed-relay'
import { validateMessage } from '../../message-bus/registry'
import { PROTOCOL_VERSION } from '../../message-bus/types'

type Msg = Record<string, unknown>

function harness() {
	const iframe = document.createElement('iframe')
	document.body.appendChild(iframe)
	const child = iframe.contentWindow
	if (!child) throw new Error('jsdom gave the iframe no contentWindow')

	/** Everything the relay put on the wire to the shell. */
	const forwarded: Msg[] = []
	// jsdom's window.parent is the window itself; hand-rolled rather than
	// jest.spyOn — the `jest` global is not injected under
	// `--experimental-vm-modules`.
	const realPost = window.parent.postMessage
	window.parent.postMessage = ((msg: unknown) => {
		forwarded.push(msg as Msg)
	}) as typeof window.postMessage

	const notifications: Array<[string, unknown]> = []
	const relay = setupEmbedRelay(iframe, {
		onChildNotification: (type, payload) => {
			notifications.push([type, payload])
		}
	})

	return {
		forwarded,
		notifications,
		/** Send a message from the embedded iframe, as the child's bus would. */
		fromChild(msg: Msg) {
			window.dispatchEvent(new MessageEvent('message', { source: child, data: msg }))
		},
		cleanup() {
			relay.cleanup()
			window.parent.postMessage = realPost
			iframe.remove()
		}
	}
}

function childMessage(type: string, extra: Msg = {}): Msg {
	return { cloudillo: true, v: PROTOCOL_VERSION, type, ...extra }
}

describe('setupEmbedRelay upward allowlist', () => {
	let h: ReturnType<typeof harness>

	beforeEach(() => {
		h = harness()
	})

	afterEach(() => {
		h.cleanup()
	})

	it('forwards the auth handshake', () => {
		h.fromChild(childMessage('auth:init.req', { id: 7, payload: { appName: 'prezillo' } }))

		expect(h.forwarded).toHaveLength(1)
		expect(h.forwarded[0]).toMatchObject({ type: 'auth:init.req' })
	})

	it('drops a rename rather than aiming it at the host document', () => {
		h.fromChild(
			childMessage('doc:rename.req', { id: 7, payload: { fileName: 'Owned by the embed' } })
		)

		expect(h.forwarded).toEqual([])
	})

	it('drops the other host-scoped capabilities too', () => {
		for (const type of [
			'doc:info.req',
			'share:create.req',
			'app:title.push',
			'camera:capture.req',
			'sensor:compass.sub',
			'import:complete.notify'
		]) {
			h.fromChild(childMessage(type, { id: 1, payload: {} }))
		}

		expect(h.forwarded).toEqual([])
	})

	/**
	 * The shell namespaces both by the HOST's appName (`handlers/storage.ts`
	 * derives `ns` from the resolved connection), so a forwarded op would read and
	 * overwrite the host document's own app data — the same cross-boundary write
	 * the allowlist refuses for `doc:rename.req`.
	 */
	it('drops storage and settings rather than lending the embed the host namespace', () => {
		h.fromChild(
			childMessage('storage:op.req', {
				id: 1,
				payload: { op: 'get', ns: 'n', key: 'k' }
			})
		)
		h.fromChild(childMessage('settings:set.req', { id: 2, payload: { key: 'k', value: 'v' } }))
		h.fromChild(childMessage('settings:get.req', { id: 3, payload: { key: 'k' } }))
		h.fromChild(childMessage('settings:list.req', { id: 4, payload: {} }))

		expect(h.forwarded).toEqual([])
	})

	/**
	 * The host still gets to react to anything its child sends — the allowlist
	 * governs what goes ON THE WIRE, not what the host may observe locally. An
	 * embedded document's aspect ratio arrives this way.
	 */
	it('still hands every child notification to the host', () => {
		h.fromChild(childMessage('doc:rename.req', { payload: { fileName: 'x' } }))

		expect(h.notifications).toEqual([['doc:rename.req', { fileName: 'x' }]])
	})

	it('stamps forwarded messages, and a child cannot clear or forge the stamp', () => {
		h.fromChild(childMessage('auth:init.req', { id: 1, payload: { appName: 'quillo' } }))
		// A child claiming not to be relayed
		h.fromChild(
			childMessage('crdt:clientid.req', {
				id: 2,
				relayed: false,
				payload: { docId: 'd' }
			})
		)

		expect(h.forwarded.map((m) => m.relayed)).toEqual([true, true])
	})

	/**
	 * `T.struct` rejects unknown fields, so an unstamped-in-the-schema type would
	 * have its stamped message dropped whole by the shell — every embed would stop
	 * working rather than merely losing the flag.
	 */
	it('leaves every forwarded message valid on the shell side', () => {
		const cases: Msg[] = [
			childMessage('auth:init.req', { id: 1, payload: { appName: 'quillo' } }),
			childMessage('auth:token.refresh.req', { id: 2 }),
			childMessage('app:ready.notify', { payload: { stage: 'auth' } }),
			childMessage('app:error.notify', { payload: { code: 1, message: 'x' } }),
			childMessage('embed:viewstate.push', { payload: { viewState: 's' } }),
			childMessage('crdt:clientid.req', { id: 3, payload: { docId: 'd' } }),
			childMessage('crdt:cache.read.req', { id: 4, payload: { docId: 'd' } }),
			childMessage('embed:open.req', {
				id: 5,
				payload: {
					targetFileId: 'f',
					targetContentType: 'cloudillo/quillo',
					sourceFileId: 's'
				}
			}),
			childMessage('doc:pick.req', { id: 6, payload: { sessionId: 's' } }),
			childMessage('media:pick.req', { id: 7, payload: { sessionId: 's' } })
		]
		for (const msg of cases) h.fromChild(msg)

		expect(h.forwarded).toHaveLength(cases.length)
		for (const msg of h.forwarded) {
			expect(msg.relayed).toBe(true)
			// The shell would drop anything this rejects, stamp and all.
			expect(validateMessage(msg, 'app>shell')).toBeDefined()
		}
	})
})

// vim: ts=4
