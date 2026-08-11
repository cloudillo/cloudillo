// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The awareness adapter over the shared roster core.
 *
 * `presence.ts` re-exports the shaping functions from `@cloudillo/core`
 * unchanged, so the sort, the dedup, the hue derivation and the tolerance of
 * hostile peer state are specified once, in
 * `libs/core/src/__tests__/presence.test.ts`. What is checked here is only what
 * this module owns: that an `Awareness` reaches those functions intact — client
 * ids mapped to `connId` and back, self identified by `awareness.clientID`, and
 * the subscribe/feed wiring around them.
 */

import { Awareness } from 'y-protocols/awareness'
import * as Y from 'yjs'

import {
	awarenessPresenceFeed,
	initPresence,
	readPresenceUsers,
	subscribePresence
} from '../presence.js'

const ME = '@me.example.com'
const ALICE = '@alice.example.com'

// Awareness starts an outdated-state timer that would keep the jest worker alive
const open: Awareness[] = []
afterEach(() => {
	for (const awareness of open.splice(0)) awareness.destroy()
})

/** An awareness whose remote states we can write directly, as a peer would. */
function makeAwareness() {
	const awareness = new Awareness(new Y.Doc())
	open.push(awareness)
	function setRemote(clientId: number, state: unknown) {
		// `states` is the raw map the protocol fills in from remote updates
		awareness.getStates().set(clientId, state as never)
	}
	return { awareness, setRemote }
}

describe('readPresenceUsers', () => {
	// `connId` is what the shared core keys, colours and tie-breaks on; `clientId`
	// is the numeric id this transport actually has. They must stay in step, or a
	// Yjs peer's colour would change the moment the shared code touched it.
	it('reports the client id as both connId and clientId', () => {
		const { awareness, setRemote } = makeAwareness()
		setRemote(101, { user: { name: 'Alice', idTag: ALICE } })

		const entry = readPresenceUsers(awareness)[0]
		expect(entry.clientId).toBe(101)
		expect(entry.connId).toBe('101')
	})

	it('passes hostile awareness states through to the shared reader without throwing', () => {
		const { awareness, setRemote } = makeAwareness()
		setRemote(101, null)
		setRemote(102, 'not an object')
		setRemote(103, {})
		setRemote(104, { user: null })
		setRemote(105, { user: 'a string' })
		setRemote(106, { user: { name: 42, idTag: { nested: true } } })
		setRemote(107, { user: { name: '   ' } })
		setRemote(108, { user: { name: 'Alice', idTag: ALICE } })

		let users: ReturnType<typeof readPresenceUsers> = []
		expect(() => {
			users = readPresenceUsers(awareness)
		}).not.toThrow()

		// States 106-107 survive as nameless anonymous entries; 101-105 have no
		// `user` field at all and are dropped.
		expect(users.filter((u) => u.idTag === ALICE)).toHaveLength(1)
		expect(users.every((u) => typeof u.name === 'string')).toBe(true)
		expect(users.every((u) => typeof u.hue === 'number')).toBe(true)
		expect(users.some((u) => u.idTag !== undefined && typeof u.idTag !== 'string')).toBe(false)
	})
})

describe('subscribePresence', () => {
	it('fires immediately and on every change, and stops after unsubscribe', () => {
		const { awareness } = makeAwareness()
		const seen: number[] = []
		const unsubscribe = subscribePresence(awareness, (users) => seen.push(users.length))

		expect(seen).toEqual([0])

		initPresence(awareness, { idTag: ME, authenticated: true })
		expect(seen.length).toBeGreaterThan(1)
		expect(seen[seen.length - 1]).toBe(1)

		const countAtUnsubscribe = seen.length
		unsubscribe()
		awareness.setLocalStateField('user', { name: 'Changed', idTag: ME })
		expect(seen).toHaveLength(countAtUnsubscribe)
	})
})

describe('awarenessPresenceFeed', () => {
	// The feed emits one entry PER CONNECTION, not the deduplicated roster:
	// `useDocPresence` resolves pictures over that list and deduplicates itself,
	// and an app filtering on its own state fields needs one entry per tab.
	it('emits every connection separately, with its whole state', () => {
		const { awareness, setRemote } = makeAwareness()
		setRemote(101, { user: { name: 'Alice', idTag: ALICE }, block: 'b-7' })
		setRemote(102, { user: { name: 'Alice', idTag: ALICE }, block: 'b-9' })

		const seen: Array<Array<{ connId: string; state?: Record<string, unknown> }>> = []
		const unsubscribe = awarenessPresenceFeed(awareness).subscribe((entries) =>
			seen.push(entries)
		)

		expect(seen).toHaveLength(1)
		expect(seen[0].map((e) => e.connId)).toEqual(['101', '102'])
		expect(seen[0].map((e) => e.state?.block)).toEqual(['b-7', 'b-9'])

		unsubscribe()
		initPresence(awareness, { idTag: ME, authenticated: true })
		expect(seen).toHaveLength(1)
	})

	it('marks our own connection', () => {
		const { awareness, setRemote } = makeAwareness()
		setRemote(101, { user: { name: 'Alice', idTag: ALICE } })
		initPresence(awareness, { idTag: ME, authenticated: true })

		let entries: Array<{ connId: string; self: boolean }> = []
		const unsubscribe = awarenessPresenceFeed(awareness).subscribe((next) => {
			entries = next
		})
		unsubscribe()

		expect(entries.find((e) => e.self)?.connId).toBe(String(awareness.clientID))
	})
})

// vim: ts=4
