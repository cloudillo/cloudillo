// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The presence roster's two load-bearing properties: a stable order the UI can
 * rely on, and total tolerance of peer-controlled state — neither transport
 * validates a presence payload beyond the identity stamp, so a malformed or
 * hostile one must degrade, not throw.
 *
 * Transport-neutral by construction: these drive `readPresenceEntries` with a
 * plain list of connections, which is exactly what the awareness adapter and the
 * RTDB client each hand it.
 */

import {
	MAX_PRESENCE_NAME_LENGTH,
	type PresenceConnection,
	type PresenceEntry,
	buildPresenceUser,
	dedupePresenceUsers,
	readPresenceEntries,
	readPresenceUser
} from '../presence.js'
import { idHue } from '../utils.js'

const ME = '@me.example.com'
const ALICE = '@alice.example.com'
const BOB = '@bob.example.com'
/** What the shell hands a share-link guest as `bus.idTag` — the owner's tag. */
const OWNER = '@owner.example.com'

/** `[connId, state]` pairs, with `self` marked by connId. */
function connections(states: Array<[string, unknown]>, selfConnId?: string): PresenceConnection[] {
	return states.map(([connId, state]) => ({ connId, state, self: connId === selfConnId }))
}

/** The deduplicated roster, straight from a list of raw states. */
function roster(states: Array<[string, unknown]>, selfConnId?: string): PresenceEntry[] {
	return dedupePresenceUsers(readPresenceEntries(connections(states, selfConnId)))
}

describe('buildPresenceUser', () => {
	it('publishes the idTag for a signed-in user', () => {
		expect(buildPresenceUser({ idTag: ME, authenticated: true })).toEqual({
			name: ME,
			idTag: ME
		})
	})

	it('prefers an explicit display name', () => {
		expect(buildPresenceUser({ idTag: ME, displayName: 'Me', authenticated: true })).toEqual({
			name: 'Me',
			idTag: ME
		})
	})

	it('publishes no idTag for an anonymous guest', () => {
		expect(buildPresenceUser({ displayName: 'Visitor' })).toEqual({ name: 'Visitor' })
		expect(buildPresenceUser({})).toEqual({ name: 'Guest' })
	})

	// The shell falls back to the context tag for an unauthenticated visitor, so
	// `idTag` alone is set for a guest too — publishing on it made every
	// share-link visitor appear as the document's owner.
	it('publishes no idTag for a guest carrying the owner tag', () => {
		expect(buildPresenceUser({ idTag: OWNER, displayName: 'Visitor' })).toEqual({
			name: 'Visitor'
		})
		expect(buildPresenceUser({ idTag: OWNER, authenticated: false })).toEqual({ name: 'Guest' })
	})

	it('does not leak the owner tag as a guest display name either', () => {
		expect(buildPresenceUser({ idTag: OWNER }).name).toBe('Guest')
	})

	it('never publishes a colour or a picture — the viewer derives those', () => {
		const user = buildPresenceUser({ idTag: ME, displayName: 'Me', authenticated: true })
		expect(user).not.toHaveProperty('color')
		expect(user).not.toHaveProperty('profilePic')
	})
})

describe('readPresenceUser', () => {
	it('reads a well-formed user', () => {
		expect(readPresenceUser({ user: { name: 'Alice', idTag: ALICE } })).toEqual({
			name: 'Alice',
			idTag: ALICE
		})
	})

	it('returns nothing for a state with no user field', () => {
		expect(readPresenceUser(null)).toBeUndefined()
		expect(readPresenceUser('not an object')).toBeUndefined()
		expect(readPresenceUser({})).toBeUndefined()
		expect(readPresenceUser({ user: null })).toBeUndefined()
		expect(readPresenceUser({ user: 'a string' })).toBeUndefined()
	})

	it('degrades a hostile user field to anonymous rather than throwing', () => {
		expect(readPresenceUser({ user: { name: 42, idTag: { nested: true } } })).toEqual({
			name: '',
			idTag: undefined
		})
	})

	it('clamps a name too long to fit any row it lands in', () => {
		const long = 'A'.repeat(MAX_PRESENCE_NAME_LENGTH + 200)
		const name = readPresenceUser({ user: { name: long } })?.name ?? ''
		expect(name).toHaveLength(MAX_PRESENCE_NAME_LENGTH)
		expect(name.endsWith('…')).toBe(true)
		// A name that fits is left exactly as it is.
		const fits = 'A'.repeat(MAX_PRESENCE_NAME_LENGTH)
		expect(readPresenceUser({ user: { name: fits } })?.name).toBe(fits)
	})

	it('strips the control characters that would break a CSS content string', () => {
		// notillo renders a peer name into `content: "…"` for its block indicator; a
		// raw newline there terminates the string and drops the whole rule. U+200B is
		// a Cf format character: invisible, and no less able to pad a row out.
		const ch = String.fromCharCode
		const hostile = `Ali${ch(10)}ce${ch(0x200b)} B${ch(9)}`
		const name = readPresenceUser({ user: { name: hostile } })?.name
		expect(name).toBe('Ali ce B')
	})
})

describe('readPresenceEntries', () => {
	it('keeps one entry per connection, unmerged', () => {
		const entries = readPresenceEntries(
			connections([
				['1', { user: { name: 'Alice', idTag: ALICE } }],
				['2', { user: { name: 'Alice', idTag: ALICE } }]
			])
		)
		expect(entries.map((e) => e.connId)).toEqual(['1', '2'])
		expect(entries.every((e) => e.connections === 1)).toBe(true)
	})

	// The whole point of the flat list: an app filters it on its own state fields
	// — notillo's block, ideallo's cursor — and those are per-tab answers.
	it('carries each connection’s whole published state', () => {
		const entries = readPresenceEntries(
			connections([['1', { user: { name: 'Alice', idTag: ALICE }, block: 'b-7' }]])
		)
		expect(entries[0].state).toEqual({ user: { name: 'Alice', idTag: ALICE }, block: 'b-7' })
	})

	it('drops a connection that has published no user', () => {
		const entries = readPresenceEntries(
			connections([
				['1', null],
				['2', {}],
				['3', { user: { name: 'Alice', idTag: ALICE } }]
			])
		)
		expect(entries.map((e) => e.connId)).toEqual(['3'])
	})

	it('derives the hue from the idTag, so it is stable across sessions', () => {
		const entries = readPresenceEntries(
			connections([['1', { user: { name: 'Alice', idTag: ALICE } }]])
		)
		expect(entries[0].hue).toBe(idHue(ALICE))
	})

	it('falls back to the connId hue for an anonymous guest', () => {
		const entries = readPresenceEntries(connections([['101', { user: { name: 'Visitor' } }]]))
		expect(entries[0].hue).toBe(idHue('101'))
	})

	it('ignores a colour or picture a peer tries to assert', () => {
		const entries = readPresenceEntries(
			connections([
				[
					'1',
					{
						user: {
							name: 'Alice',
							idTag: ALICE,
							color: '#ff0000',
							profilePic: 'p1~spoof'
						}
					}
				]
			])
		)
		expect(entries[0]).not.toHaveProperty('color')
		expect(entries[0].profilePic).toBeUndefined()
	})
})

describe('dedupePresenceUsers', () => {
	it('sorts self first, then identified users by name, then anonymous', () => {
		const users = roster(
			[
				['100', { user: { name: 'Zoe', idTag: ME } }],
				['101', { user: { name: 'Alice', idTag: ALICE } }],
				['102', { user: { name: 'Visitor' } }],
				['103', { user: { name: 'Bob', idTag: BOB } }]
			],
			'100'
		)

		expect(users.map((u) => u.name)).toEqual(['Zoe', 'Alice', 'Bob', 'Visitor'])
		expect(users[0].self).toBe(true)
	})

	it('collapses two tabs of the same user into one entry', () => {
		const users = roster([
			['101', { user: { name: 'Alice', idTag: ALICE } }],
			['102', { user: { name: 'Alice', idTag: ALICE } }],
			['103', { user: { name: 'Bob', idTag: BOB } }]
		])

		expect(users).toHaveLength(2)
		expect(users.find((u) => u.idTag === ALICE)?.connections).toBe(2)
		expect(users.find((u) => u.idTag === BOB)?.connections).toBe(1)
	})

	it('keeps anonymous guests separate — they have no identity to merge on', () => {
		expect(
			roster([
				['101', { user: { name: 'Visitor' } }],
				['102', { user: { name: 'Visitor' } }]
			])
		).toHaveLength(2)
	})

	it('marks the entry as self even when our own second tab was seen first', () => {
		const users = roster(
			[
				['101', { user: { name: 'Me', idTag: ME } }],
				['102', { user: { name: 'Me', idTag: ME } }]
			],
			'102'
		)

		expect(users).toHaveLength(1)
		expect(users[0].self).toBe(true)
		expect(users[0].connId).toBe('102')
		expect(users[0].connections).toBe(2)
	})

	// A merged entry spans connections whose states differ, so there is no
	// truthful single value — an app that needs one reads `entries` instead.
	it('drops the per-connection state from a merged entry', () => {
		const users = roster([['101', { user: { name: 'Alice', idTag: ALICE }, block: 'b-7' }]])
		expect(users[0]).not.toHaveProperty('state')
	})

	// Deduplicating must not disturb the flat list the same call site is holding.
	it('does not mutate the per-connection entries it was given', () => {
		const entries = readPresenceEntries(
			connections([
				['101', { user: { name: 'Alice', idTag: ALICE } }],
				['102', { user: { name: 'Alice', idTag: ALICE } }]
			])
		)
		dedupePresenceUsers(entries)
		expect(entries.map((e) => e.connections)).toEqual([1, 1])
		expect(entries.map((e) => e.state)).not.toContain(undefined)
	})

	it('tolerates malformed and hostile peer states', () => {
		let users: PresenceEntry[] = []
		expect(() => {
			users = roster([
				['101', null],
				['102', 'not an object'],
				['103', {}],
				['104', { user: null }],
				['105', { user: 'a string' }],
				['106', { user: { name: 42, idTag: { nested: true } } }],
				['107', { user: { name: '   ' } }],
				['108', { user: { name: 'Alice', idTag: ALICE } }]
			])
		}).not.toThrow()

		// States 106-107 survive as nameless anonymous entries; 101-105 have no
		// `user` field at all and are dropped.
		expect(users.filter((u) => u.idTag === ALICE)).toHaveLength(1)
		expect(users.every((u) => typeof u.name === 'string')).toBe(true)
		expect(users.every((u) => typeof u.hue === 'number')).toBe(true)
		expect(users.some((u) => u.idTag !== undefined && typeof u.idTag !== 'string')).toBe(false)
	})

	it('ignores an idTag that is not a string, rather than merging on it', () => {
		const users = roster([
			['101', { user: { name: 'A', idTag: 1 } }],
			['102', { user: { name: 'B', idTag: 1 } }]
		])
		expect(users).toHaveLength(2)
		expect(users.every((u) => u.idTag === undefined)).toBe(true)
	})

	// Two guests with the same name are ordered by connId rather than left to the
	// sort's whim, so the avatar stack does not reshuffle on every roster change.
	it('breaks a tie on connId', () => {
		const users = roster([
			['200', { user: { name: 'Visitor' } }],
			['100', { user: { name: 'Visitor' } }]
		])
		expect(users.map((u) => u.connId)).toEqual(['100', '200'])
	})
})

// vim: ts=4
