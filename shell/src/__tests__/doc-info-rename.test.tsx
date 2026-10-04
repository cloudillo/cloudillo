// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * `useDocInfo`'s rename, and the document it is allowed to act on.
 *
 * The resolver is re-registered synchronously on the render where `resId`
 * changes, but `infoRef` / `localApiRef` / `localRowRef` are only rewritten once
 * the new document's row fetch comes back. A `doc:rename.req` arriving inside
 * that window used to be answered from the PREVIOUS document's refs, so
 * `api.files.update(current.fileId, …)` renamed the document the user had just
 * navigated away from.
 *
 * `.test.tsx` so jest gives this suite the jsdom environment (see jest.config.cjs).
 */

import { jest } from '@jest/globals'
import { act, renderHook, waitFor } from '@testing-library/react'
// Statically imported, not pulled in from inside the mock factory below: a
// dynamic import there runs while this module is still linking.
import { atom } from 'jotai'

import type { DocInfoResolver } from '../message-bus/handlers/docinfo.js'

const ME = 'me.example.com'
const DOC_A = `${ME}:f1~aaa`
const DOC_B = `${ME}:f2~bbb`

/** Every `files.update` the hook issued: [fileId, patch]. */
const updates: Array<[string, Record<string, unknown>]> = []

/** Rows keyed by fileId, as the node would answer `files.list({ fileId })`. */
const rows = new Map<string, Record<string, unknown>>()

/** Resolves the pending `files.list` calls, so a fetch can be held mid-flight. */
let releaseList: (() => void) | undefined

/** Set to make every row fetch fail, as an unreachable node would. */
let listFails = false

/** How many row fetches went out — the retry budget, counted. */
let listCalls = 0

const api = {
	files: {
		async list({ fileId }: { fileId: string }) {
			listCalls++
			if (listFails) throw new Error('offline')
			if (releaseList) {
				await new Promise<void>((resolve) => {
					releaseList = resolve
				})
			}
			const row = rows.get(fileId)
			return row ? [row] : []
		},
		async update(fileId: string, patch: Record<string, unknown>) {
			updates.push([fileId, patch])
			return {}
		}
	}
}

/** The resolver currently registered with the shell bus, newest last. */
const resolvers: DocInfoResolver[] = []

/**
 * Armed before a rerender: the resId to attempt a rename with the instant a new
 * resolver is registered — i.e. from inside the very commit where `resId`
 * changed, before React has re-rendered and refreshed the refs. That is exactly
 * when a relayed `doc:rename.req` can land in production.
 */
let renameOnRegister: { resId: string; fileName: string } | undefined
let renameOnRegisterResult: Promise<{ ok: boolean; error?: string }> | undefined

jest.unstable_mockModule('../message-bus/index.js', () => ({
	setDocInfoResolver: (resolver: DocInfoResolver) => {
		resolvers.push(resolver)
		if (renameOnRegister) {
			const { resId, fileName } = renameOnRegister
			renameOnRegister = undefined
			renameOnRegisterResult = resolver.rename(resId, fileName)
		}
	},
	clearDocInfoResolver: () => {}
}))

jest.unstable_mockModule('@cloudillo/react', () => ({
	useAuth: () => [{ idTag: ME }]
}))

// Stable across renders on purpose: `getClientFor` is a dependency of the hook's
// resolve effect, so a fresh identity per render re-runs it on every state change
// — an endless fetch loop that `act` can never see the end of.
const apiContext = { getClientFor: () => null }

jest.unstable_mockModule('../context/index.js', () => ({
	activeContextAtom: atom<{ idTag: string; roles: string[] } | null>(null),
	contextRolesAtom: atom(new Map<string, string[]>()),
	fileViewUpdateAtom: atom<{ version: number; file: unknown } | undefined>(undefined),
	useApiContext: () => apiContext,
	useContextAwareApi: () => ({ api }),
	useCurrentContextIdTag: () => ME
}))

jest.unstable_mockModule('../utils.js', () => ({
	isPermissionError: () => false,
	isMissingError: () => false
}))

const { useDocInfo } = await import('../apps/useDocInfo.js')

function row(fileId: string, fileName: string) {
	return {
		entryId: `e:${fileId}`,
		fileId,
		status: 'A',
		contentType: 'cloudillo/quillo',
		fileName,
		createdAt: '2026-01-01T00:00:00Z',
		// The backend back-fills `owner` to the serving tenant, so an "own" row always names us
		owner: { idTag: ME }
	}
}

beforeEach(() => {
	jest.useRealTimers()
	updates.length = 0
	resolvers.length = 0
	releaseList = undefined
	listFails = false
	listCalls = 0
	renameOnRegister = undefined
	renameOnRegisterResult = undefined
	rows.clear()
	rows.set('f1~aaa', row('f1~aaa', 'Doc A'))
	rows.set('f2~bbb', row('f2~bbb', 'Doc B'))
})

describe('useDocInfo rename', () => {
	it('renames the document it resolved', async () => {
		const { result } = renderHook(() => useDocInfo(DOC_A))
		await waitFor(() => expect(result.current?.state).toBe('ready'))
		expect(result.current?.canRename).toBe(true)

		const res = await resolvers[resolvers.length - 1].rename(DOC_A, 'Renamed A')

		expect(res).toMatchObject({ ok: true, fileName: 'Renamed A' })
		// Rename is a placement call, so it goes to the row's entry, not the content id
		expect(updates).toEqual([['e:f1~aaa', { fileName: 'Renamed A' }]])
	})

	it('refuses a rename aimed at a resId it is not serving', async () => {
		const { result } = renderHook(() => useDocInfo(DOC_A))
		await waitFor(() => expect(result.current?.state).toBe('ready'))

		const res = await resolvers[resolvers.length - 1].rename(DOC_B, 'Wrong document')

		expect(res).toMatchObject({ ok: false })
		expect(updates).toEqual([])
	})

	/**
	 * The regression: at the moment the resolver for B is registered, the refs
	 * still describe A — including `fileId` and `canRename: true`. Without the
	 * identity check the rename lands on A's fileId under B's name.
	 */
	it('does not act on the previous document while the new one is still resolving', async () => {
		const { result, rerender } = renderHook(({ resId }) => useDocInfo(resId), {
			initialProps: { resId: DOC_A }
		})
		await waitFor(() => expect(result.current?.state).toBe('ready'))
		expect(result.current?.canRename).toBe(true)

		// Hold B's row fetch open, so nothing can refresh the refs behind our back.
		releaseList = () => {}
		renameOnRegister = { resId: DOC_B, fileName: 'Landed on the wrong file' }
		rerender({ resId: DOC_B })

		expect(renameOnRegisterResult).toBeDefined()
		await expect(renameOnRegisterResult).resolves.toMatchObject({ ok: false })
		expect(updates).toEqual([])
	})
})

/**
 * A fetch nobody answers holds the skeleton so a blip does not cost the rename
 * button. The budget is what stops that becoming permanent: once it is spent the
 * bar must resolve to 'unavailable', or the failure branch re-enters
 * `state: 'loading'` with no timer left to fire and no dependency that will ever
 * change again — an `aria-busy` spinner for the life of the tab.
 */
describe('useDocInfo retry budget', () => {
	const DELAYS = [3000, 10_000, 30_000]

	it('settles on unavailable once the retry budget is spent', async () => {
		const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
		jest.useFakeTimers()
		listFails = true

		const { result } = renderHook(() => useDocInfo(DOC_A))
		await act(async () => {})
		expect(result.current?.state).toBe('loading')

		// Each attempt fails the same way, and each keeps the skeleton up.
		for (const delay of DELAYS.slice(0, -1)) {
			await act(async () => {
				jest.advanceTimersByTime(delay)
			})
			expect(result.current?.state).toBe('loading')
		}

		await act(async () => {
			jest.advanceTimersByTime(DELAYS[DELAYS.length - 1])
		})
		// Honest, and what `DocBarTitle` renders as "Document unavailable".
		expect(result.current?.state).toBe('unavailable')
		// One attempt plus one per delay, and the node is not polled beyond that.
		expect(listCalls).toBe(DELAYS.length + 1)

		await act(async () => {
			jest.advanceTimersByTime(300_000)
		})
		expect(listCalls).toBe(DELAYS.length + 1)
		expect(result.current?.state).toBe('unavailable')
		warn.mockRestore()
	})

	it('recovers within the budget without ever showing unavailable', async () => {
		const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
		jest.useFakeTimers()
		listFails = true

		const { result } = renderHook(() => useDocInfo(DOC_A))
		await act(async () => {})
		expect(result.current?.state).toBe('loading')

		listFails = false
		await act(async () => {
			jest.advanceTimersByTime(DELAYS[0])
		})

		expect(result.current?.state).toBe('ready')
		expect(result.current?.fileName).toBe('Doc A')
		warn.mockRestore()
	})
})

// vim: ts=4
