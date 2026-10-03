// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Which hat an entry into community B wears, and what B's remembered hats become.
 *
 * `.test.tsx` so jest gives this suite the jsdom environment (see jest.config.cjs).
 */

import { jest } from '@jest/globals'
import { act, renderHook } from '@testing-library/react'
import { atom, getDefaultStore } from 'jotai'

const B = 'b.example.com'

class FetchError extends Error {
	constructor(
		public code: string,
		message: string,
		public httpStatus?: number
	) {
		super(message)
	}
}

jest.unstable_mockModule('@cloudillo/core', () => ({
	FetchError,
	contextKey: (idTag: string, hat?: string) => (hat ? `${idTag}|${hat}` : idTag)
}))

const getProfile = jest.fn<(idTag: string) => Promise<{ hats?: string[] }>>()
const setHats = jest.fn<(idTag: string, hats: string[]) => Promise<void>>()
// Stable identities: the hook's callbacks depend on them.
const api = { profiles: { get: getProfile, setHats } }
const toastError = jest.fn()

jest.unstable_mockModule('@cloudillo/react', () => ({
	useApi: () => ({ api }),
	useToast: () => ({ error: toastError })
}))

jest.unstable_mockModule('react-i18next', () => ({
	useTranslation: () => ({ t: (s: string) => s })
}))

const setActiveContext = jest.fn<(idTag: string, opts?: { hat?: string }) => Promise<boolean>>()
const switchNav = jest.fn()
const switchTo = jest.fn<(idTag: string) => Promise<void>>()
const contextSwitch = { switchTo }

jest.unstable_mockModule('../context/hooks', () => ({
	useApiContext: () => ({ setActiveContext }),
	useContextSwitch: () => contextSwitch,
	useContextSwitchNav: () => switchNav
}))

// Real jotai atoms; only their module is stubbed, to keep the shell's atom graph out.
const activeContextAtom = atom<{ idTag: string; hat?: { idTag: string } } | undefined>(undefined)
const communitiesAtom = atom<{ idTag: string; name?: string }[]>([])
const partnerCommunitiesAtom = atom<{ idTag: string; hat?: { idTag: string } }[]>([])

jest.unstable_mockModule('../context/atoms', () => ({
	activeContextAtom,
	communitiesAtom,
	partnerCommunitiesAtom,
	refFromActive: ({ idTag }: { idTag: string }) => ({ idTag })
}))

const { hatPickerAtom, pendingHatEntryAtom, toFront, useEnterContext, useHatEntry } = await import(
	'../context/hat-entry.js'
)

const store = getDefaultStore()

/** A refusal (403) for `hat`, success for everything else. */
function refuse(...hats: string[]) {
	setActiveContext.mockImplementation(async (_idTag, opts) => {
		if (opts?.hat && hats.includes(opts.hat)) throw new FetchError('E-AUTH', 'no', 403)
		return true
	})
}

function remembered(hats: string[]) {
	getProfile.mockResolvedValue({ hats })
}

async function flush() {
	await act(async () => {
		for (let i = 0; i < 5; i++) await Promise.resolve()
	})
}

beforeEach(() => {
	getProfile.mockReset()
	setHats.mockReset()
	setHats.mockResolvedValue(undefined)
	setActiveContext.mockReset()
	setActiveContext.mockResolvedValue(true)
	toastError.mockReset()
	switchNav.mockReset()
	switchTo.mockReset()
	switchTo.mockResolvedValue(undefined)
	store.set(communitiesAtom, [])
	store.set(partnerCommunitiesAtom, [])
	store.set(hatPickerAtom, undefined)
	store.set(pendingHatEntryAtom, undefined)
	store.set(activeContextAtom, undefined)
})

describe('toFront', () => {
	it('moves an existing entry to the front, keeping the rest in order', () => {
		expect(toFront(['a', 'b', 'c'], 'c')).toEqual(['c', 'a', 'b'])
	})

	it('prepends a new entry', () => {
		expect(toFront(['a', 'b'], 'x')).toEqual(['x', 'a', 'b'])
	})

	it("handles '' (as yourself) like any other entry", () => {
		expect(toFront(['a', ''], '')).toEqual(['', 'a'])
		expect(toFront([], '')).toEqual([''])
	})
})

describe('useHatEntry — plain entry', () => {
	it('enters bare with no remembered hats', async () => {
		remembered([])
		const { result } = renderHook(() => useHatEntry())
		await act(() => result.current.enter(B))
		expect(setActiveContext).toHaveBeenCalledWith(B)
		expect(setHats).not.toHaveBeenCalled()
	})

	it('wears the one remembered hat without asking', async () => {
		remembered(['a'])
		const { result } = renderHook(() => useHatEntry())
		await act(() => result.current.enter(B))
		expect(setActiveContext).toHaveBeenCalledWith(B, { hat: 'a' })
		expect(store.get(hatPickerAtom)).toBeUndefined()
		expect(setHats).not.toHaveBeenCalled()
	})

	it('asks with 2+ and moves the choice to the front', async () => {
		remembered(['a', 'b'])
		const { result } = renderHook(() => useHatEntry())
		let done: Promise<void> | undefined
		act(() => {
			done = result.current.enter(B)
		})
		await flush()
		expect(store.get(hatPickerAtom)?.entries).toEqual(['a', 'b'])
		await act(async () => {
			store.get(hatPickerAtom)?.resolve('b', ['a', 'b'])
			await done
		})
		expect(setActiveContext).toHaveBeenCalledWith(B, { hat: 'b' })
		expect(setHats).toHaveBeenCalledWith(B, ['b', 'a'])
	})

	it('enters as yourself when the picker is dismissed', async () => {
		remembered(['a', 'b'])
		const { result } = renderHook(() => useHatEntry())
		let done: Promise<void> | undefined
		act(() => {
			done = result.current.enter(B)
		})
		await flush()
		await act(async () => {
			store.get(hatPickerAtom)?.resolve(undefined, ['a', 'b'])
			await done
		})
		expect(setActiveContext).toHaveBeenCalledTimes(1)
		expect(setActiveContext).toHaveBeenCalledWith(B)
		expect(setHats).toHaveBeenCalledWith(B, ['', 'a', 'b'])
	})

	it('enters nothing when the picker is superseded by another entry', async () => {
		remembered(['a', 'b'])
		const { result } = renderHook(() => useHatEntry())
		let done: Promise<void> | undefined
		act(() => {
			done = result.current.enter(B)
		})
		await flush()
		await act(async () => {
			store.get(hatPickerAtom)?.resolve(null, ['a', 'b'])
			await done
		})
		expect(store.get(hatPickerAtom)).toBeUndefined()
		expect(setActiveContext).not.toHaveBeenCalled()
		expect(toastError).not.toHaveBeenCalled()
	})
})

describe('useHatEntry — plain entry as a member', () => {
	it('enters bare despite a remembered hat, and remembers bare first', async () => {
		remembered(['a'])
		store.set(communitiesAtom, [{ idTag: B }])
		const { result } = renderHook(() => useHatEntry())
		await act(() => result.current.enter(B))
		expect(setActiveContext).toHaveBeenCalledWith(B)
		expect(setActiveContext).toHaveBeenCalledTimes(1)
		expect(store.get(hatPickerAtom)).toBeUndefined()
		expect(setHats).toHaveBeenCalledWith(B, ['', 'a'])
	})
})

describe('useHatEntry — refusals', () => {
	it('toasts a refused hat, drops it and tries the next', async () => {
		remembered(['a', 'b'])
		refuse('a')
		const { result } = renderHook(() => useHatEntry())
		await act(() => result.current.enter(B, 'a'))
		expect(toastError).toHaveBeenCalledTimes(1)
		expect(setActiveContext).toHaveBeenLastCalledWith(B, { hat: 'b' })
		expect(setHats).toHaveBeenCalledWith(B, ['b'])
	})

	it('enters bare when every hat is refused', async () => {
		remembered(['a', 'b'])
		refuse('a', 'b')
		const { result } = renderHook(() => useHatEntry())
		await act(() => result.current.enter(B, 'a'))
		expect(setActiveContext).toHaveBeenLastCalledWith(B)
	})

	it('rethrows anything but a refusal', async () => {
		remembered(['a'])
		setActiveContext.mockRejectedValue(new FetchError('E-SRV', 'boom', 500))
		const { result } = renderHook(() => useHatEntry())
		await expect(act(() => result.current.enter(B, 'a'))).rejects.toThrow('boom')
		expect(setHats).not.toHaveBeenCalled()
	})
})

describe('useHatEntry — the remembered list', () => {
	it('puts a new hat in front of the remembered ones', async () => {
		remembered(['a'])
		const { result } = renderHook(() => useHatEntry())
		await act(() => result.current.enter(B, 'c'))
		expect(setActiveContext).toHaveBeenCalledWith(B, { hat: 'c' })
		expect(setHats).toHaveBeenCalledWith(B, ['c', 'a'])
	})

	it('saves nothing when a newer switch took over', async () => {
		remembered(['a'])
		setActiveContext.mockResolvedValue(false)
		const { result } = renderHook(() => useHatEntry())
		await act(() => result.current.enter(B, 'c'))
		expect(setActiveContext).toHaveBeenCalledWith(B, { hat: 'c' })
		expect(setHats).not.toHaveBeenCalled()
	})

	it('does not save an unchanged list', async () => {
		remembered(['a', 'b'])
		const { result } = renderHook(() => useHatEntry())
		await act(() => result.current.enter(B, 'a'))
		expect(setHats).not.toHaveBeenCalled()
	})

	it("updates a pinned partner row's hat to the one entered with", async () => {
		remembered(['a'])
		store.set(partnerCommunitiesAtom, [{ idTag: B, hat: { idTag: 'a' } }])
		setActiveContext.mockImplementation(async (idTag, opts) => {
			store.set(activeContextAtom, {
				idTag,
				hat: opts?.hat ? { idTag: opts.hat } : undefined
			})
			return true
		})
		const { result } = renderHook(() => useHatEntry())
		await act(() => result.current.enter(B, 'c'))
		expect(store.get(partnerCommunitiesAtom)).toEqual([{ idTag: B, hat: { idTag: 'c' } }])
	})

	it('remembers an unpinned partner entered under a hat', async () => {
		remembered([])
		setActiveContext.mockImplementation(async (idTag, opts) => {
			store.set(activeContextAtom, {
				idTag,
				hat: opts?.hat ? { idTag: opts.hat } : undefined
			})
			return true
		})
		const { result } = renderHook(() => useHatEntry())
		await act(() => result.current.enter(B, ''))
		expect(store.get(partnerCommunitiesAtom)).toEqual([])
		await act(() => result.current.enter(B, 'a'))
		expect(store.get(partnerCommunitiesAtom)).toEqual([{ idTag: B, hat: { idTag: 'a' } }])
	})

	it('never overwrites the list when it could not be read', async () => {
		getProfile.mockRejectedValue(new Error('offline'))
		const { result } = renderHook(() => useHatEntry())
		await act(() => result.current.enter(B, 'x'))
		expect(setActiveContext).toHaveBeenCalledWith(B, { hat: 'x' })
		await act(() => result.current.fallback(B, 'a'))
		expect(setActiveContext).toHaveBeenLastCalledWith(B)
		expect(setHats).not.toHaveBeenCalled()
	})

	it('skips a hat refused mid-session without forgetting it', async () => {
		remembered(['a', 'b'])
		const { result } = renderHook(() => useHatEntry())
		await act(() => result.current.fallback(B, 'a'))
		expect(setActiveContext).toHaveBeenLastCalledWith(B, { hat: 'b' })
		expect(setHats).not.toHaveBeenCalled()
	})
})

describe('useEnterContext', () => {
	it('enters in place when B is already the active context', async () => {
		remembered([])
		store.set(activeContextAtom, { idTag: B })
		const { result } = renderHook(() => useEnterContext())
		await act(() => result.current(B, { hat: 'a' }))
		expect(setActiveContext).toHaveBeenCalledWith(B, { hat: 'a' })
		expect(store.get(pendingHatEntryAtom)).toBeUndefined()
		expect(switchNav).toHaveBeenCalledWith(B)
	})

	it('drops the hat in place and lands on the feed with { hat: "", feed }', async () => {
		remembered(['a'])
		store.set(activeContextAtom, { idTag: B })
		const { result } = renderHook(() => useEnterContext())
		await act(() => result.current(B, { hat: '', feed: true }))
		expect(setActiveContext).toHaveBeenCalledWith(B)
		expect(switchTo).toHaveBeenCalledWith(B)
		expect(switchNav).not.toHaveBeenCalled()
	})

	it('parks the hat and navigates when B is another context', async () => {
		const { result } = renderHook(() => useEnterContext())
		await act(() => result.current(B, { hat: 'a' }))
		expect(setActiveContext).not.toHaveBeenCalled()
		expect(store.get(pendingHatEntryAtom)).toEqual({ idTag: B, hat: 'a' })
		expect(switchNav).toHaveBeenCalledWith(B)
	})
})

// vim: ts=4
