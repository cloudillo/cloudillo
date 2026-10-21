// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { act, renderHook } from '@testing-library/react'

import {
	type ExportTaskHandle,
	useExportProgress
} from '../components/ExportProgress/ExportProgress.js'

/** A task that waits until released, exposing its handle */
function controlled() {
	let handle: ExportTaskHandle | undefined
	let release: (v: string) => void = () => undefined
	let fail: (e: Error) => void = () => undefined
	const task = (h: ExportTaskHandle) =>
		new Promise<string>((resolve, reject) => {
			handle = h
			release = resolve
			fail = reject
			h.signal.addEventListener('abort', () => reject(new Error('aborted')))
		})
	return {
		task,
		handle: () => handle as ExportTaskHandle,
		release: (v: string) => release(v),
		fail: (e: Error) => fail(e)
	}
}

describe('useExportProgress', () => {
	it('merges progress and resets it when the task resolves', async () => {
		const { result } = renderHook(() => useExportProgress())
		const c = controlled()
		let p!: Promise<string | undefined>
		act(() => {
			p = result.current.run(c.task)
		})
		expect(result.current.progress).toEqual({ done: 0, total: 0 })
		act(() => c.handle().setProgress({ done: 1, total: 3 }))
		act(() => c.handle().setProgress({ pct: 50 }))
		expect(result.current.progress).toEqual({ done: 1, total: 3, pct: 50 })
		await act(async () => c.release('ok'))
		expect(await p).toBe('ok')
		expect(result.current.progress).toBeNull()
	})

	it('resolves undefined on abort and rethrows other errors', async () => {
		const { result } = renderHook(() => useExportProgress())
		const a = controlled()
		let pa!: Promise<string | undefined>
		act(() => {
			pa = result.current.run(a.task)
		})
		await act(async () => result.current.abort())
		expect(await pa).toBeUndefined()
		expect(result.current.progress).toBeNull()

		const b = controlled()
		let pb!: Promise<string | undefined>
		act(() => {
			pb = result.current.run(b.task)
		})
		const rejected = expect(pb).rejects.toThrow('boom')
		await act(async () => b.fail(new Error('boom')))
		await rejected
		expect(result.current.progress).toBeNull()
	})

	it('ignores a second run while one is in flight; abort still reaches the first', async () => {
		const { result } = renderHook(() => useExportProgress())
		const first = controlled()
		const second = controlled()
		let p1!: Promise<string | undefined>
		let p2!: Promise<string | undefined>
		act(() => {
			p1 = result.current.run(first.task)
		})
		act(() => {
			p2 = result.current.run(second.task)
		})
		expect(await p2).toBeUndefined()
		expect(second.handle()).toBeUndefined()
		expect(result.current.progress).not.toBeNull()
		await act(async () => result.current.abort())
		expect(await p1).toBeUndefined()
		expect(result.current.progress).toBeNull()
	})

	it('closes at once on cancel, even when the task never settles', async () => {
		const { result } = renderHook(() => useExportProgress())
		let handle!: ExportTaskHandle
		let release!: (v: string) => void
		let p!: Promise<string | undefined>
		act(() => {
			p = result.current.run(
				(h) =>
					new Promise<string>((resolve) => {
						handle = h
						release = resolve
					})
			)
		})
		act(() => result.current.abort())
		expect(result.current.progress).toBeNull()

		// A new export may start; the old task's late progress and result are dropped
		const next = controlled()
		act(() => {
			result.current.run(next.task)
		})
		act(() => handle.setProgress({ pct: 99 }))
		expect(result.current.progress).toEqual({ done: 0, total: 0 })
		await act(async () => release('late'))
		expect(await p).toBeUndefined()
		expect(result.current.progress).not.toBeNull()
		await act(async () => result.current.abort())
	})
})

// vim: ts=4
