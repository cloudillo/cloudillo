// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * An SVG `<image>` does not reliably fire `onLoad` for an already-cached href, and React
 * reuses the same element across a variant change — so a load event for the previous href
 * cannot be told apart from one for the current one. `useFileImage` therefore drives its
 * state from a per-URL `new Image()` probe, and only resets to `'loading'` when the *file*
 * changes, not when a zoom picks a different rendition of it.
 */

import { act, renderHook } from '@testing-library/react'

const { useFileImage } = await import('../useFileImage.js')

/** URLs the stubbed browser cache reports as already decoded. */
const cached = new Set<string>()

/** The most recent probe, so a test can fail it. */
let lastProbe: StubImage | undefined

class StubImage {
	src = ''
	onerror: (() => void) | null = null
	constructor() {
		lastProbe = this
	}
	get complete(): boolean {
		return cached.has(this.src)
	}
	get naturalWidth(): number {
		return cached.has(this.src) ? 640 : 0
	}
}

describe('useFileImage', () => {
	beforeEach(() => {
		cached.clear()
		globalThis.Image = StubImage as unknown as typeof Image
	})

	it('settles a cached image at `loaded` without any onLoad', () => {
		const { result } = renderHook(() => useFileImage('alice.example', 'file-1', 300, 200))
		cached.add(result.current.url as string)

		// Re-render as a remount would: the probe runs again and must stick.
		const { result: second } = renderHook(() =>
			useFileImage('alice.example', 'file-1', 300, 200)
		)

		expect(second.current.state).toBe('loaded')
	})

	it('refuses a URL with no owner tag', () => {
		const { result } = renderHook(() => useFileImage(undefined, 'file-1', 300, 200))

		expect(result.current.url).toBeUndefined()
		expect(result.current.state).toBe('error')
	})

	it('holds the painted rendition when only the zoom variant changes', () => {
		cached.add('https://cl-o.alice.example/api/files/file-1?variant=vis.sd')
		const { result, rerender } = renderHook(
			({ w }: { w: number }) => useFileImage('alice.example', 'file-1', w, w),
			{ initialProps: { w: 300 } }
		)
		expect(result.current.state).toBe('loaded')

		// 700px crosses into vis.md, which is NOT cached. The vis.sd already on screen stays.
		rerender({ w: 700 })
		expect(result.current.state).toBe('loaded')
	})

	it('resets to `loading` when the file itself changes', () => {
		cached.add('https://cl-o.alice.example/api/files/file-1?variant=vis.sd')
		const { result, rerender } = renderHook(
			({ fileId }: { fileId: string }) => useFileImage('alice.example', fileId, 300, 200),
			{ initialProps: { fileId: 'file-1' } }
		)
		expect(result.current.state).toBe('loaded')

		rerender({ fileId: 'file-2' })
		expect(result.current.state).toBe('loading')
	})

	it('keeps the painted href across a token rotation', () => {
		cached.add('https://cl-o.alice.example/api/files/file-1?variant=vis.sd&token=tok-1')
		const { result, rerender } = renderHook(
			({ token }: { token: string }) =>
				useFileImage('alice.example', 'file-1', 300, 200, token),
			{ initialProps: { token: 'tok-1' } }
		)
		expect(result.current.state).toBe('loaded')
		const url = result.current.url

		rerender({ token: 'tok-2' })
		expect(result.current.url).toBe(url)
		expect(result.current.state).toBe('loaded')
	})

	it('retries a failed load with the rotated token', () => {
		const { result, rerender } = renderHook(
			({ token }: { token: string }) =>
				useFileImage('alice.example', 'file-1', 300, 200, token),
			{ initialProps: { token: 'tok-1' } }
		)
		act(() => {
			lastProbe?.onerror?.()
		})
		expect(result.current.state).toBe('error')

		rerender({ token: 'tok-2' })
		expect(result.current.url).toContain('token=tok-2')
	})
})

// vim: ts=4
