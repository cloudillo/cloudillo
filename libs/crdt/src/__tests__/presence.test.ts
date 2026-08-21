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

import { awarenessPresenceFeed, initPresence } from '../presence.js'

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
