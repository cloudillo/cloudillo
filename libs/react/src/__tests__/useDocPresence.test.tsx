// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { PresenceEntry } from '@cloudillo/core'
import { jest } from '@jest/globals'
import { act, renderHook } from '@testing-library/react'
import type { Awareness } from 'y-protocols/awareness'

/**
 * What the DOCUMENT's node knows about each idTag. Stands in for
 * `GET /profiles/batch`; a tag absent here is one the node never mirrored.
 */
const nodeProfiles = new Map<string, { idTag: string; name?: string; profilePic?: string }>()

type NodeProfile = { idTag: string; name?: string; profilePic?: string }

/** What the node would answer: the tags it has mirrored, in request order. */
const answerFromNode = async (idTags: string[]): Promise<NodeProfile[]> =>
	idTags.map((tag) => nodeProfiles.get(tag)).filter((p): p is NodeProfile => !!p)

/** Every chunk `GET /profiles/batch` was asked for, oldest first. */
const batchCalls: string[][] = []

/** Swap in per test to make the lookup fail, hang, or split. */
let getBatchImpl: (idTags: string[]) => Promise<NodeProfile[]> = answerFromNode

/**
 * Stand in for `@cloudillo/core`, so the profile lookup resolves without a shell
 * or a network.
 *
 * Assembled from core's own submodules rather than by spreading the package
 * index: `@cloudillo/core` and `.../core/lib/index.js` are the same resolved
 * module, so re-importing either one inside this factory hands back the mock and
 * recurses until the heap gives out. The submodules resolve to different files
 * and stay real.
 *
 * These are every core symbol the module graph under test touches at import
 * time — `presence.tsx` plus the `@cloudillo/crdt` barrel it pulls in. The
 * roster core is spread in whole rather than listed: `@cloudillo/crdt` RE-EXPORTS
 * parts of it, and a re-export of a name the mock does not define fails to link.
 */
jest.unstable_mockModule('@cloudillo/core', async () => {
	const { getCrdtUrl, getFileUrl } = await import('../../../core/lib/urls.js')
	const { idHue } = await import('../../../core/lib/utils.js')
	const fileUtils = await import('../../../core/lib/file-utils.js')
	const presence = await import('../../../core/lib/presence.js')
	const bus = {
		ownerTag: '@node.example',
		idTag: '@node.example',
		accessToken: undefined
	}
	return {
		...presence,
		...fileUtils,
		getCrdtUrl,
		getFileUrl,
		idHue,
		getAppBus: () => bus,
		createApiClient: () => ({
			profiles: {
				getBatch: async (idTags: string[]) => {
					batchCalls.push([...idTags])
					return getBatchImpl(idTags)
				}
			}
		})
	}
})

const { useDocPresence } = await import('../presence.js')

/**
 * A minimal stand-in for `y-protocols`' Awareness.
 *
 * Only what `subscribePresence` touches — the real thing needs a Y.Doc and a
 * network provider, neither of which this hook has any opinion about.
 *
 * Every peer here is deliberately anonymous (no idTag): identified peers send
 * the hook down the profile-resolution path, which needs a live app bus.
 */
function fakeAwareness(clientID = 1) {
	const states = new Map<number, unknown>()
	const handlers = new Set<() => void>()

	return {
		clientID,
		states,
		handlerCount: () => handlers.size,
		getStates: () => states,
		on: (_event: string, cb: () => void) => {
			handlers.add(cb)
		},
		off: (_event: string, cb: () => void) => {
			handlers.delete(cb)
		},
		/** Replace one client's state and fire `change`, as the protocol would. */
		set(id: number, state: unknown) {
			states.set(id, state)
			for (const cb of handlers) cb()
		}
	}
}

type FakeAwareness = ReturnType<typeof fakeAwareness>

function asAwareness(a: FakeAwareness): Awareness {
	return a as unknown as Awareness
}

/**
 * A plain `PresenceFeed` — what `@cloudillo/rtdb`'s `client.presence()` returns.
 *
 * Unlike awareness it hands over already-shaped entries, one per connection; the
 * hook must treat the two sources identically past that.
 */
function fakeFeed(initial: PresenceEntry[]) {
	const subscribers = new Set<(entries: PresenceEntry[]) => void>()
	let entries = initial

	return {
		subscriberCount: () => subscribers.size,
		subscribe(cb: (entries: PresenceEntry[]) => void) {
			subscribers.add(cb)
			cb(entries)
			return () => {
				subscribers.delete(cb)
			}
		},
		emit(next: PresenceEntry[]) {
			entries = next
			for (const cb of subscribers) cb(next)
		}
	}
}

function entry(connId: string, name: string, extra: Partial<PresenceEntry> = {}): PresenceEntry {
	return { connId, name, self: false, connections: 1, hue: 0, ...extra }
}

describe('useDocPresence', () => {
	beforeEach(() => {
		nodeProfiles.clear()
		batchCalls.length = 0
		getBatchImpl = answerFromNode
		jest.useFakeTimers()
	})

	afterEach(() => {
		jest.useRealTimers()
	})

	it('returns an empty roster with no awareness channel', () => {
		const { result } = renderHook(() => useDocPresence(undefined))

		expect(result.current.users).toEqual([])
		expect(result.current.count).toBe(0)
		expect(result.current.self).toBeUndefined()
	})

	it('reports the current roster immediately, without waiting out the throttle', () => {
		const awareness = fakeAwareness(1)
		awareness.states.set(1, { user: { name: 'Ada' } })
		awareness.states.set(2, { user: { name: 'Grace' } })

		const { result } = renderHook(() => useDocPresence(asAwareness(awareness)))

		expect(result.current.count).toBe(2)
		expect(result.current.self?.name).toBe('Ada')
		expect(result.current.users.map((u) => u.name)).toEqual(['Ada', 'Grace'])
	})

	it('throttles later changes', () => {
		const awareness = fakeAwareness(1)
		awareness.states.set(1, { user: { name: 'Ada' } })

		const { result } = renderHook(() => useDocPresence(asAwareness(awareness)))
		expect(result.current.count).toBe(1)

		act(() => {
			awareness.set(2, { user: { name: 'Grace' } })
		})
		// Awareness fires on every cursor move; the roster must not follow.
		expect(result.current.count).toBe(1)

		act(() => {
			jest.advanceTimersByTime(500)
		})
		expect(result.current.count).toBe(2)
		expect(result.current.users.map((u) => u.name)).toEqual(['Ada', 'Grace'])
	})

	// Self first, then identified users by name, then anonymous guests — the
	// sort that makes "who am I looking at" answerable at a glance.
	it('sorts self first and anonymous guests last', async () => {
		const awareness = fakeAwareness(3)
		awareness.states.set(1, { user: { name: 'Anon' } })
		awareness.states.set(2, { user: { name: 'Ada', idTag: '@ada.example' } })
		awareness.states.set(3, { user: { name: 'Zoe', idTag: '@zoe.example' } })

		const { result } = renderHook(() => useDocPresence(asAwareness(awareness)))

		expect(result.current.users.map((u) => u.name)).toEqual(['Zoe', 'Ada', 'Anon'])
		expect(result.current.users[0].self).toBe(true)

		// Profile lookup goes through a bus that is not initialized here; it must
		// fail quietly and leave the roster standing on initials.
		await act(async () => {})
		expect(result.current.users.map((u) => u.profilePic)).toEqual([
			undefined,
			undefined,
			undefined
		])
	})

	it('collapses one user’s two tabs into a single entry', async () => {
		const awareness = fakeAwareness(1)
		awareness.states.set(1, { user: { name: 'Ada', idTag: '@ada.example' } })
		awareness.states.set(2, { user: { name: 'Ada', idTag: '@ada.example' } })

		const { result } = renderHook(() => useDocPresence(asAwareness(awareness)))
		// Settle the profile lookup an identified peer kicks off.
		await act(async () => {})

		expect(result.current.count).toBe(1)
		expect(result.current.users[0].connections).toBe(2)
		expect(result.current.users[0].self).toBe(true)
	})

	// The RTDB transport hands over a feed rather than an awareness. Everything
	// downstream — dedup, sort, profile resolution — is the same code path.
	it('takes a plain presence feed and deduplicates it like an awareness', async () => {
		const feed = fakeFeed([
			entry('c1', 'Ada', { self: true, idTag: '@ada.example', state: { block: 'b-1' } }),
			entry('c2', 'Ada', { idTag: '@ada.example', state: { block: 'b-2' } }),
			entry('c3', 'Anon')
		])

		const { result, unmount } = renderHook(() => useDocPresence(feed))
		await act(async () => {})

		// Deduplicated for the avatar stack...
		expect(result.current.count).toBe(2)
		expect(result.current.users.map((u) => u.name)).toEqual(['Ada', 'Anon'])
		expect(result.current.users[0].connections).toBe(2)
		expect(result.current.self?.connId).toBe('c1')
		// ...but per-connection for the app, which is where its own state lives.
		expect(result.current.entries.map((e) => e.state?.block)).toEqual(['b-1', 'b-2', undefined])

		unmount()
		expect(feed.subscriberCount()).toBe(0)
	})

	it('unsubscribes on unmount', () => {
		const awareness = fakeAwareness(1)
		awareness.states.set(1, { user: { name: 'Ada' } })

		const { unmount } = renderHook(() => useDocPresence(asAwareness(awareness)))
		expect(awareness.handlerCount()).toBe(1)

		unmount()
		expect(awareness.handlerCount()).toBe(0)
	})

	it('drops the roster when the awareness channel goes away', () => {
		const awareness = fakeAwareness(1)
		awareness.states.set(1, { user: { name: 'Ada' } })

		const { result, rerender } = renderHook(({ a }: { a?: Awareness }) => useDocPresence(a), {
			initialProps: { a: asAwareness(awareness) as Awareness | undefined }
		})
		expect(result.current.count).toBe(1)

		rerender({ a: undefined })
		expect(result.current.count).toBe(0)
		expect(awareness.handlerCount()).toBe(0)
	})

	// The throttle holds a trailing call for up to 500 ms. Left armed, it fires
	// after the reset above and repopulates the roster from a channel the hook has
	// already let go of — a ghost that outlives its document.
	it('stays empty when a throttled change was pending as the channel went away', () => {
		const awareness = fakeAwareness(1)
		awareness.states.set(1, { user: { name: 'Ada' } })

		const { result, rerender } = renderHook(({ a }: { a?: Awareness }) => useDocPresence(a), {
			initialProps: { a: asAwareness(awareness) as Awareness | undefined }
		})
		expect(result.current.count).toBe(1)

		act(() => {
			awareness.set(2, { user: { name: 'Grace' } })
		})
		// Still throttled — the pending call is what this test is about.
		expect(result.current.count).toBe(1)

		rerender({ a: undefined })
		expect(result.current.count).toBe(0)

		act(() => {
			jest.advanceTimersByTime(500)
		})
		expect(result.current.count).toBe(0)
	})

	// The tag is server-stamped by the `/ws/crdt` relay, so the profile behind it
	// is the authority on what that person is called — whether or not they have a
	// picture. Gating the override on `profilePic` let anyone without one display
	// whatever name they liked.
	it('takes the node’s name for a resolved profile with no picture', async () => {
		nodeProfiles.set('@ada.example', { idTag: '@ada.example', name: 'Ada Lovelace' })

		const awareness = fakeAwareness(1)
		awareness.states.set(1, { user: { name: 'Self' } })
		awareness.states.set(2, { user: { name: 'Definitely Not Ada', idTag: '@ada.example' } })

		const { result } = renderHook(() => useDocPresence(asAwareness(awareness)))
		await act(async () => {})

		const peer = result.current.users.find((u) => u.idTag === '@ada.example')
		expect(peer?.name).toBe('Ada Lovelace')
		expect(peer?.profilePic).toBeUndefined()
	})

	it('keeps the broadcast name when the node has never heard of the tag', async () => {
		const awareness = fakeAwareness(1)
		awareness.states.set(1, { user: { name: 'Self' } })
		awareness.states.set(2, { user: { name: 'Stranger', idTag: '@nobody.example' } })

		const { result } = renderHook(() => useDocPresence(asAwareness(awareness)))
		await act(async () => {})

		const peer = result.current.users.find((u) => u.idTag === '@nobody.example')
		expect(peer?.name).toBe('Stranger')
	})

	// A transport failure is not the node saying "no such person". Caching it as
	// one used to blank a face for the rest of the session on a single blip.
	it('does not cache a failed lookup as an answer, and retries after the back-off', async () => {
		nodeProfiles.set('@ada.example', { idTag: '@ada.example', name: 'Ada Lovelace' })
		getBatchImpl = async () => {
			throw new Error('offline')
		}

		const awareness = fakeAwareness(1)
		awareness.states.set(1, { user: { name: 'Self' } })
		awareness.states.set(2, { user: { name: 'Ada', idTag: '@ada.example' } })

		const { result } = renderHook(() => useDocPresence(asAwareness(awareness)))
		await act(async () => {})
		expect(batchCalls).toEqual([['@ada.example']])
		expect(result.current.users.find((u) => u.idTag === '@ada.example')?.name).toBe('Ada')

		// Inside the back-off window, a roster change asks about the new tag only.
		getBatchImpl = answerFromNode
		await act(async () => {
			awareness.set(3, { user: { name: 'Grace', idTag: '@grace.example' } })
			jest.advanceTimersByTime(500)
		})
		expect(batchCalls).toEqual([['@ada.example'], ['@grace.example']])

		// Past it, the failed tag is asked about again and resolves.
		await act(async () => {
			jest.advanceTimersByTime(31_000)
			awareness.set(4, { user: { name: 'Anon' } })
			jest.advanceTimersByTime(500)
		})
		expect(batchCalls.at(-1)).toEqual(['@ada.example'])
		expect(result.current.users.find((u) => u.idTag === '@ada.example')?.name).toBe(
			'Ada Lovelace'
		)
	})

	// The back-off map only ever says "not yet". A Yjs roster churns on every cursor
	// move and so re-runs the effect by accident, but RTDB presence changes only on
	// a page or block event — without a timer of its own, one blip left every
	// collaborator a monogram for the rest of the session.
	it('retries a failed lookup on a feed that never changes again', async () => {
		nodeProfiles.set('@ada.example', {
			idTag: '@ada.example',
			name: 'Ada Lovelace',
			profilePic: 'p1~pic'
		})
		getBatchImpl = async () => {
			throw new Error('offline')
		}

		const feed = fakeFeed([
			entry('c1', 'Self', { self: true }),
			entry('c2', 'Ada', { idTag: '@ada.example' })
		])

		const { result } = renderHook(() => useDocPresence(feed))
		await act(async () => {})
		expect(batchCalls).toEqual([['@ada.example']])
		expect(result.current.users.find((u) => u.idTag === '@ada.example')?.profilePic).toBe(
			undefined
		)

		// Nothing touches the feed — only the back-off timer expiring may ask again.
		getBatchImpl = answerFromNode
		await act(async () => {
			jest.advanceTimersByTime(30_000)
		})
		await act(async () => {})

		expect(batchCalls).toEqual([['@ada.example'], ['@ada.example']])
		const ada = result.current.users.find((u) => u.idTag === '@ada.example')
		expect(ada?.name).toBe('Ada Lovelace')
		expect(ada?.profilePic).toContain('p1~pic')
	})

	it('keeps the profiles from a chunk that succeeded when another chunk fails', async () => {
		const awareness = fakeAwareness(1)
		awareness.states.set(1, { user: { name: 'Self' } })
		// One more than PROFILE_BATCH_MAX (64), so the lookup splits in two.
		for (let i = 0; i < 65; i++) {
			const idTag = `@peer${i}.example`
			nodeProfiles.set(idTag, { idTag, name: `Peer ${i}` })
			awareness.states.set(i + 2, { user: { name: `broadcast ${i}`, idTag } })
		}
		// The full chunk fails; the one-tag remainder answers.
		getBatchImpl = async (idTags) => {
			if (idTags.length > 1) throw new Error('offline')
			return answerFromNode(idTags)
		}

		const { result } = renderHook(() => useDocPresence(asAwareness(awareness)))
		await act(async () => {})

		expect(batchCalls.map((c) => c.length)).toEqual([64, 1])
		// The rejected chunk used to discard this one along with itself.
		expect(result.current.users.filter((u) => u.name?.startsWith('Peer '))).toHaveLength(1)
		expect(result.current.users.filter((u) => u.name?.startsWith('broadcast '))).toHaveLength(
			64
		)
	})

	it('does not re-ask for tags that already have a request in the air', async () => {
		nodeProfiles.set('@ada.example', { idTag: '@ada.example', name: 'Ada Lovelace' })
		const releases: Array<() => void> = []
		getBatchImpl = async (idTags) => {
			await new Promise<void>((resolve) => releases.push(resolve))
			return answerFromNode(idTags)
		}

		const awareness = fakeAwareness(1)
		awareness.states.set(1, { user: { name: 'Self' } })
		awareness.states.set(2, { user: { name: 'Ada', idTag: '@ada.example' } })

		const { result } = renderHook(() => useDocPresence(asAwareness(awareness)))
		await act(async () => {})
		expect(batchCalls).toEqual([['@ada.example']])

		// A roster change mid-flight: Ada is already being asked about, so only the
		// tag we have not asked about yet goes out.
		await act(async () => {
			awareness.set(3, { user: { name: 'Grace', idTag: '@grace.example' } })
			jest.advanceTimersByTime(500)
		})
		expect(batchCalls).toEqual([['@ada.example'], ['@grace.example']])

		await act(async () => {
			for (const release of releases) release()
		})
		// A second flush: releasing only starts the reply on its way back.
		await act(async () => {})
		expect(result.current.users.find((u) => u.idTag === '@ada.example')?.name).toBe(
			'Ada Lovelace'
		)
	})
})

// vim: ts=4
