// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * The shared profile store behind every face: chunking, in-flight dedup across
 * hooks, back-off after a failure, and `null` for a tag the node has never seen.
 */

import { jest } from '@jest/globals'
import { act, renderHook } from '@testing-library/react'

type NodeProfile = { idTag: string; name?: string }

/** What the node has mirrored; a tag absent here gets omitted from the answer. */
const nodeProfiles = new Map<string, NodeProfile>()

const answerFromNode = async (idTags: string[]): Promise<NodeProfile[]> =>
	idTags.map((tag) => nodeProfiles.get(tag)).filter((p): p is NodeProfile => !!p)

/** Every chunk `GET /profiles/batch` was asked for, oldest first. */
const batchCalls: string[][] = []

let getBatchImpl: (idTags: string[]) => Promise<NodeProfile[]> = answerFromNode

// `profile-cache.ts` imports nothing else from core, so a two-name mock links.
jest.unstable_mockModule('@cloudillo/core', async () => ({
	decodeBadges: (await import('../../../core/lib/api-types.js')).decodeBadges,
	getAppBus: () => ({ idTag: 'node.example', ownerTag: undefined, accessToken: undefined }),
	createApiClient: () => ({
		profiles: {
			getBatch: async (idTags: string[]) => {
				batchCalls.push([...idTags])
				return getBatchImpl(idTags)
			}
		}
	})
}))

const { invalidateProfile, liveBadges, useProfile, useProfiles, resetProfileCache } = await import(
	'../profile-cache.js'
)

const NODE = { tag: 'node.example' }

describe('profile cache', () => {
	beforeEach(() => {
		resetProfileCache()
		nodeProfiles.clear()
		batchCalls.length = 0
		getBatchImpl = answerFromNode
	})

	afterEach(() => {
		jest.useRealTimers()
		jest.restoreAllMocks()
	})

	it('splits a large request into chunks of 64', async () => {
		const tags = Array.from({ length: 130 }, (_, i) => `@peer${i}.example`)
		for (const idTag of tags) nodeProfiles.set(idTag, { idTag, name: idTag })

		const { result } = renderHook(() => useProfiles(tags, NODE))
		await act(async () => {})

		expect(batchCalls.map((c) => c.length)).toEqual([64, 64, 2])
		expect(Object.keys(result.current)).toHaveLength(130)
	})

	it('fetches a tag wanted by two hooks once', async () => {
		nodeProfiles.set('@ada.example', { idTag: '@ada.example', name: 'Ada Lovelace' })

		const a = renderHook(() => useProfile('@ada.example', NODE))
		const b = renderHook(() => useProfile('@ada.example', NODE))
		await act(async () => {})

		expect(batchCalls).toEqual([['@ada.example']])
		expect(a.result.current?.name).toBe('Ada Lovelace')
		expect(b.result.current?.name).toBe('Ada Lovelace')

		// Already cached: a third hook costs nothing.
		const c = renderHook(() => useProfile('@ada.example', NODE))
		await act(async () => {})
		expect(batchCalls).toHaveLength(1)
		expect(c.result.current?.name).toBe('Ada Lovelace')
	})

	it('batches the tags of two hooks in one render into one call', async () => {
		nodeProfiles.set('@ada.example', { idTag: '@ada.example', name: 'Ada Lovelace' })
		nodeProfiles.set('@bob.example', { idTag: '@bob.example', name: 'Bob' })

		const { result } = renderHook(() => [
			useProfile('@ada.example', NODE),
			useProfile('@bob.example', NODE)
		])
		await act(async () => {})

		expect(batchCalls).toEqual([['@ada.example', '@bob.example']])
		expect(result.current.map((p) => p?.name)).toEqual(['Ada Lovelace', 'Bob'])
	})

	it('fetches nothing queued before a reset', async () => {
		// Queued for the next microtask; unmounted so nothing asks again after the reset.
		const { unmount } = renderHook(() => useProfile('@ada.example', NODE))
		unmount()
		resetProfileCache()
		await act(async () => {})

		expect(batchCalls).toEqual([])
	})

	it('keeps only unexpired, catalog-valid badges', () => {
		const now = Date.now() / 1000
		const community = { idTag: 'comm.example', name: 'Comm', type: 'community' }
		const live = { community, slot: 'STD', level: 'verified', exp: now + 3600 }
		const badges = liveBadges({
			idTag: '@ada.example',
			badges: [
				live,
				{ community, slot: 'PAT', level: 'gold', exp: now - 1 },
				{ community, slot: 'PAT', level: 'platinum', exp: now + 3600 },
				{ community, slot: 'XYZ', level: 'verified', exp: now + 3600 }
			]
		})
		// The unread `type` is dropped, not a reason to reject the badge.
		expect(badges).toEqual([{ ...live, community: { idTag: 'comm.example', name: 'Comm' } }])
		expect(liveBadges({ idTag: '@ada.example' })).toEqual([])
	})

	it('keeps a badge whose community has no name or type', () => {
		const live = {
			community: { idTag: 'comm.example' },
			slot: 'STD',
			level: 'verified',
			exp: Date.now() / 1000 + 3600
		}
		expect(liveBadges({ idTag: '@ada.example', badges: [live] })).toEqual([live])
	})

	it('invalidateProfile refetches only that tag', async () => {
		nodeProfiles.set('@ada.example', { idTag: '@ada.example', name: 'Ada' })
		nodeProfiles.set('@bob.example', { idTag: '@bob.example', name: 'Bob' })
		const { result } = renderHook(() => useProfiles(['@ada.example', '@bob.example'], NODE))
		await act(async () => {})
		expect(batchCalls).toEqual([['@ada.example', '@bob.example']])

		nodeProfiles.set('@ada.example', { idTag: '@ada.example', name: 'Ada Lovelace' })
		await act(async () => {
			invalidateProfile('@ada.example')
		})
		await act(async () => {})

		expect(batchCalls).toEqual([['@ada.example', '@bob.example'], ['@ada.example']])
		expect(result.current['@ada.example']?.name).toBe('Ada Lovelace')
		expect(result.current['@bob.example']?.name).toBe('Bob')
	})

	it('drops an answer that was in flight when the tag was invalidated', async () => {
		let release: (p: NodeProfile[]) => void = () => {}
		getBatchImpl = () => new Promise((resolve) => (release = resolve))
		const { result } = renderHook(() => useProfile('@ada.example', NODE))
		await act(async () => {})
		expect(batchCalls).toEqual([['@ada.example']])

		getBatchImpl = async () => [{ idTag: '@ada.example', name: 'Ada Lovelace' }]
		await act(async () => {
			invalidateProfile('@ada.example')
			release([{ idTag: '@ada.example', name: 'Ada' }])
		})
		await act(async () => {})

		expect(batchCalls).toEqual([['@ada.example'], ['@ada.example']])
		expect(result.current?.name).toBe('Ada Lovelace')
	})

	it('answers null for a tag the node does not know', async () => {
		const { result } = renderHook(() => useProfile('@nobody.example', NODE))
		expect(result.current).toBeUndefined()
		await act(async () => {})

		expect(result.current).toBeNull()
	})

	it('fetches nothing without a node tag', async () => {
		const { result } = renderHook(() => useProfile('@ada.example', {}))
		await act(async () => {})

		expect(batchCalls).toEqual([])
		expect(result.current).toBeUndefined()
	})

	it('backs off after a failure and retries once the back-off expires', async () => {
		jest.useFakeTimers()
		const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
		nodeProfiles.set('@ada.example', { idTag: '@ada.example', name: 'Ada Lovelace' })
		getBatchImpl = async () => {
			throw new Error('offline')
		}

		const { result } = renderHook(() => useProfile('@ada.example', NODE))
		await act(async () => {})
		expect(batchCalls).toEqual([['@ada.example']])
		expect(result.current).toBeUndefined()
		expect(warn).toHaveBeenCalledWith(
			expect.stringContaining('[profiles]'),
			expect.anything(),
			expect.anything()
		)

		// Inside the back-off a new hook asking for the same tag does not fetch.
		getBatchImpl = answerFromNode
		renderHook(() => useProfile('@ada.example', NODE))
		await act(async () => {})
		expect(batchCalls).toHaveLength(1)

		// The retry timer wakes the subscribers, which ask again.
		await act(async () => {
			jest.advanceTimersByTime(30_000)
		})
		await act(async () => {})

		expect(batchCalls).toEqual([['@ada.example'], ['@ada.example']])
		expect(result.current?.name).toBe('Ada Lovelace')
	})

	it('retries a failure that happened while the retry timer was already pending', async () => {
		jest.useFakeTimers()
		jest.spyOn(console, 'warn').mockImplementation(() => {})
		nodeProfiles.set('@ada.example', { idTag: '@ada.example', name: 'Ada Lovelace' })
		nodeProfiles.set('@bob.example', { idTag: '@bob.example', name: 'Bob' })
		getBatchImpl = async () => {
			throw new Error('offline')
		}

		const a = renderHook(() => useProfile('@ada.example', NODE))
		await act(async () => {})
		await act(async () => {
			jest.advanceTimersByTime(10_000)
		})
		const b = renderHook(() => useProfile('@bob.example', NODE))
		await act(async () => {})
		expect(batchCalls).toEqual([['@ada.example'], ['@bob.example']])

		getBatchImpl = answerFromNode
		// The first timer fires at 30s: only Ada's back-off has expired.
		await act(async () => {
			jest.advanceTimersByTime(20_000)
		})
		await act(async () => {})
		expect(a.result.current?.name).toBe('Ada Lovelace')
		expect(b.result.current).toBeUndefined()

		// A follow-up timer wakes for Bob's back-off, 10s later.
		await act(async () => {
			jest.advanceTimersByTime(10_000)
		})
		await act(async () => {})
		expect(b.result.current?.name).toBe('Bob')
	})
})

// vim: ts=4
