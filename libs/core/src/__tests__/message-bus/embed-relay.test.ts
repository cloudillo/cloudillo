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

/**
 * jsdom's `window.parent` is the window itself, which is the one case the relay
 * refuses to forward in — a direct child of the shell reaches it unaided, and
 * reposting there would deliver every message twice. So the nested suites stand a
 * fake parent up, both to record the wire and to make this the nested case they are
 * meant to be. Hand-rolled rather than jest.spyOn: the `jest` global is not injected
 * under `--experimental-vm-modules`.
 *
 * Kept out of `harness()` so its restore is owned by an `afterEach` and runs whatever
 * a case does — a leaked fake parent would silently turn every later suite in this
 * file into the nested case too.
 */
function installFakeParent() {
	const forwarded: Msg[] = []
	const real = Object.getOwnPropertyDescriptor(window, 'parent')
	Object.defineProperty(window, 'parent', {
		configurable: true,
		value: {
			postMessage: (msg: unknown) => {
				forwarded.push(msg as Msg)
			}
		}
	})
	return {
		/** Everything the relay put on the wire to the shell. */
		forwarded,
		restore() {
			if (real) Object.defineProperty(window, 'parent', real)
			else Reflect.deleteProperty(window, 'parent')
		}
	}
}

/**
 * The same, for a window that *is* the top one: `window.parent` is `window`, so the
 * repost the relay would make is `window.postMessage`. Recorded rather than left to
 * jsdom's own delivery, which is asynchronous and would not show up in the case.
 */
function installTopWindowSpy() {
	const sent: Msg[] = []
	const real = Object.getOwnPropertyDescriptor(window, 'postMessage')
	Object.defineProperty(window, 'postMessage', {
		configurable: true,
		value: (msg: unknown) => {
			sent.push(msg as Msg)
		}
	})
	return {
		sent,
		restore() {
			if (real) Object.defineProperty(window, 'postMessage', real)
			else Reflect.deleteProperty(window, 'postMessage')
		}
	}
}

function harness(forwarded: Msg[] = []) {
	const iframe = document.createElement('iframe')
	// The src the host set: the relay stamps the child's `_embed:<nonce>` key from it
	iframe.src = 'https://x/#h:f2:_embed:n1'
	document.body.appendChild(iframe)
	const child = iframe.contentWindow
	if (!child) throw new Error('jsdom gave the iframe no contentWindow')

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
			iframe.remove()
		}
	}
}

function childMessage(type: string, extra: Msg = {}): Msg {
	return { cloudillo: true, v: PROTOCOL_VERSION, type, ...extra }
}

describe('setupEmbedRelay upward allowlist', () => {
	let parent: ReturnType<typeof installFakeParent>
	let h: ReturnType<typeof harness>

	beforeEach(() => {
		parent = installFakeParent()
		h = harness(parent.forwarded)
	})

	afterEach(() => {
		try {
			h.cleanup()
		} finally {
			parent.restore()
		}
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
		h.fromChild(childMessage('import:complete.notify', { payload: { success: true } }))

		expect(h.forwarded).toEqual([])
		expect(h.notifications).toHaveLength(1)
	})

	it('hands the host only well-formed notifications', () => {
		h.fromChild(childMessage('app:error.notify', { payload: { code: '500', message: 'x' } }))
		expect(h.notifications).toEqual([])

		h.fromChild(childMessage('app:error.notify', { payload: { code: 500, message: 'x' } }))
		expect(h.notifications).toEqual([['app:error.notify', { code: 500, message: 'x' }]])
	})

	it('tells the shell on cleanup which embed went away', () => {
		h.cleanup()

		expect(h.forwarded).toEqual([
			childMessage('embed:close.notify', { payload: { key: '_embed:n1' } })
		])
		expect(validateMessage(h.forwarded[0], 'app>shell')).toBeDefined()
	})

	it('keeps a view report local: a grandchild report never sizes the outer frame', () => {
		const report = { kind: 'fixed', natural: { w: 1, h: 1 } }
		h.fromChild(childMessage('embed:view.report', { payload: report }))

		expect(h.forwarded).toEqual([])
		expect(h.notifications).toEqual([['embed:view.report', report]])
	})

	it('does not deliver a relayed view report locally', () => {
		h.fromChild(
			childMessage('embed:view.report', {
				relayed: true,
				payload: { kind: 'fixed', natural: { w: 1, h: 1 } }
			})
		)

		expect(h.notifications).toEqual([])
	})

	// A grandchild's exit describes the middle frame, so only our own child's exit counts
	it('delivers only a non-relayed embed:view.exit locally', () => {
		h.fromChild(childMessage('embed:view.exit', { relayed: true, payload: {} }))
		expect(h.notifications).toEqual([])

		h.fromChild(childMessage('embed:view.exit', { payload: {} }))
		expect(h.notifications).toEqual([['embed:view.exit', {}]])
	})

	it('drops a malformed view report', () => {
		h.fromChild(childMessage('embed:view.report', { payload: { kind: 'fixed' } }))

		expect(h.notifications).toEqual([])
	})

	it('drops a view report with an out-of-bounds natural size', () => {
		for (const w of [Number.NaN, 1e9]) {
			h.fromChild(
				childMessage('embed:view.report', {
					payload: { kind: 'fixed', natural: { w, h: 100 } }
				})
			)
		}

		expect(h.notifications).toEqual([])
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

	it('stamps the embed key from the iframe src, overwriting a forged one', () => {
		h.fromChild(
			childMessage('crdt:clientid.req', {
				id: 1,
				relayedFrom: 'evil',
				payload: { docId: 'd' }
			})
		)

		expect(h.forwarded.map((m) => m.relayedFrom)).toEqual(['_embed:n1'])
	})

	it('drops the embed key of an already-relayed message (grandchild cannot pose as child)', () => {
		h.fromChild(
			childMessage('embed:open.req', {
				id: 1,
				relayed: true,
				relayedFrom: '_embed:x',
				payload: {
					targetFileId: 'f',
					targetContentType: 'cloudillo/quillo',
					sourceFileId: 's'
				}
			})
		)

		expect(h.forwarded[0].relayed).toBe(true)
		expect(h.forwarded[0].relayedFrom).toBeUndefined()
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
			childMessage('media:pick.req', { id: 7, payload: { sessionId: 's' } }),
			childMessage('embed:close.notify', { payload: { key: '_embed:n9' } })
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

/**
 * The relay also runs shell-side, where the host is not itself embedded: `layout.tsx`
 * mounts an app in an iframe of the top window. There `window.parent` is `window`, so
 * the repost would hand the shell the child's message a *second* time — and for
 * `auth:init.req` the duplicate loses its pending registration and answers the child
 * `ok: false, 'App not registered'`, beating the real reply whenever that one waits on
 * a token mint. Deliberately no fake parent here: `isTopWindow` is the branch under
 * test, and the suites above stub it away.
 */
describe('setupEmbedRelay — a top-level window', () => {
	let top: ReturnType<typeof installTopWindowSpy>
	let h: ReturnType<typeof harness>

	beforeEach(() => {
		top = installTopWindowSpy()
		h = harness()
	})

	afterEach(() => {
		try {
			h.cleanup()
		} finally {
			top.restore()
		}
	})

	it('forwards nothing upward, not even an allowlisted type', () => {
		expect(window.parent).toBe(window)
		h.fromChild(childMessage('auth:init.req', { id: 7, payload: { appName: 'prezillo' } }))

		expect(top.sent).toEqual([])
	})

	it('still hands the notification to the host', () => {
		// The guard suppresses the repost, not local delivery — a shell-side embed
		// keeps its view report channel.
		const report = { kind: 'fixed', natural: { w: 1, h: 1 } }
		h.fromChild(childMessage('embed:view.report', { payload: report }))

		expect(h.notifications).toEqual([['embed:view.report', report]])
		expect(top.sent).toEqual([])
	})
})

// vim: ts=4
