// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/** `useEmbedRenders` cache, scheduling and blob URL lifetime, with `renderEmbed` mocked before the dynamic import. */

import { jest } from '@jest/globals'
import * as React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import * as Y from 'yjs'

const SVG = '<svg xmlns="http://www.w3.org/2000/svg"/>'
const render = async (_o: unknown) => ({ pages: [SVG] })
const renderEmbed = jest.fn(render)

const core = await import('@cloudillo/core')
jest.unstable_mockModule('@cloudillo/core', () => ({
	...core,
	getAppBus: () => ({}),
	renderEmbed
}))
jest.unstable_mockModule('@cloudillo/fonts', () => ({ inlineSvgFonts: async (s: string) => s }))

const { openPublication } = await import('../crdt/document.js')
const { addFrame, updateFrame } = await import('../crdt/frame-ops.js')
const { MAX_RENDERS, useEmbedRenders } = await import('../embeds/useEmbedRenders.js')

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/** Mount the hook on a doc with `frames` `emb` frames; images load (or fail) as `loads` says. */
/** `src` null: no source file id yet. */
async function mount(loads = true, src: string | null = 'src', frames = 1) {
	const yDoc = new Y.Doc()
	const doc = openPublication(yDoc)
	const ids = Array.from({ length: frames }, (_, i) =>
		addFrame(yDoc, doc, {
			t: 'emb',
			anchor: { sec: 's1', page: 0 },
			x: 0,
			y: 0,
			w: 100,
			h: 100,
			rot: 0,
			z: 1,
			data: { address: core.docRef('calcillo', `a.b:f${i + 1}`) }
		} as never)
	)
	let n = 0
	const revoked: string[] = []
	URL.createObjectURL = () => `blob:${++n}`
	URL.revokeObjectURL = (u: string) => void revoked.push(u)
	Object.defineProperty(HTMLImageElement.prototype, 'src', {
		configurable: true,
		set(this: HTMLImageElement) {
			setTimeout(() => (loads ? this.onload : this.onerror)?.call(this, new Event('x')))
		}
	})
	let renders: ReturnType<typeof useEmbedRenders> | undefined
	function Probe({ src }: { src?: string }) {
		renders = useEmbedRenders(doc, src)
		return null
	}
	const root = createRoot(document.createElement('div'))
	await act(async () => root.render(<Probe src={src ?? undefined} />))
	const r = () => renders as ReturnType<typeof useEmbedRenders>
	return {
		yDoc,
		doc,
		ids,
		root,
		revoked,
		renders: r,
		setSrc: (s?: string) => act(async () => root.render(<Probe src={s} />)),
		want: () => timed(() => r().want(ids[0], 1000, 1000))
	}
}

/** Run `fn`, then every timer, under fake timers. */
async function timed(fn: () => void) {
	jest.useFakeTimers()
	await act(async () => {
		fn()
		await jest.runAllTimersAsync()
	})
	jest.useRealTimers()
}

describe('useEmbedRenders', () => {
	beforeEach(() => {
		renderEmbed.mockReset()
		renderEmbed.mockImplementation(render)
	})

	it('revokes the blob URL of a render that fails to load', async () => {
		const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
		const { root, revoked, want } = await mount(false)
		await want()
		expect(revoked).toEqual(['blob:1'])
		act(() => root.unmount())
		warn.mockRestore()
	})

	it('revokes cached URLs on unmount', async () => {
		const { root, revoked, renders, want } = await mount()
		await want()
		expect(renders().images.size).toBe(1)
		expect(revoked).toEqual([])
		act(() => root.unmount())
		expect(revoked).toEqual(['blob:1'])
	})

	it('renders a twice-asked box once', async () => {
		const { root, renders, ids } = await mount()
		await timed(() => {
			renders().want(ids[0], 1000, 1000)
			renders().want(ids[0], 1000, 1000)
		})
		expect(renderEmbed).toHaveBeenCalledTimes(1)
		act(() => root.unmount())
	})

	it('keeps a failure until refresh', async () => {
		const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
		const { root, renders, ids, want } = await mount(false)
		await want()
		await want()
		expect(renderEmbed).toHaveBeenCalledTimes(1)
		await act(async () => renders().refresh(ids[0]))
		await want()
		expect(renderEmbed).toHaveBeenCalledTimes(2)
		act(() => root.unmount())
		warn.mockRestore()
	})

	it('renders once the source file id arrives', async () => {
		const { root, setSrc, want } = await mount(true, null)
		await want()
		expect(renderEmbed).not.toHaveBeenCalled()
		await setSrc('src')
		await want()
		expect(renderEmbed).toHaveBeenCalledTimes(1)
		act(() => root.unmount())
	})

	it('re-renders when only the address changes', async () => {
		const { root, renders, yDoc, doc, ids, want } = await mount()
		await want()
		expect(renders().images.size).toBe(1)
		await timed(() =>
			updateFrame(yDoc, doc, ids[0], { data: { address: core.docRef('calcillo', 'a.b:f2') } })
		)
		expect(renderEmbed).toHaveBeenCalledTimes(2)
		act(() => root.unmount())
	})

	it('starts at most MAX_RENDERS renders', async () => {
		const { root, renders, ids } = await mount(true, 'src', MAX_RENDERS + 1)
		await timed(() => {
			for (const id of ids) renders().want(id, 1000, 1000)
		})
		expect(renderEmbed).toHaveBeenCalledTimes(MAX_RENDERS)
		act(() => root.unmount())
	})

	it('runs at most 2 renders at once', async () => {
		let release = () => {}
		const held = new Promise<void>((r) => {
			release = r
		})
		renderEmbed.mockImplementation(async () => {
			await held
			return { pages: [SVG] }
		})
		const { root, renders, ids } = await mount(true, 'src', 3)
		await timed(() => {
			for (const id of ids) renders().want(id, 1000, 1000)
		})
		expect(renderEmbed).toHaveBeenCalledTimes(2)
		await timed(release)
		expect(renderEmbed).toHaveBeenCalledTimes(3)
		act(() => root.unmount())
	})
})

// vim: ts=4
