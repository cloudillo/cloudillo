// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/** Pasting a `cl:` ref through `useClipboard`, with the app bus mocked before the dynamic import. */

import { jest } from '@jest/globals'
import * as React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

const LINK = { fileId: 'f1', appId: 'calcillo' }
const core = await import('@cloudillo/core')
jest.unstable_mockModule('@cloudillo/core', () => ({
	...core,
	getAppBus: () => ({
		linkFromPaste: (e: ClipboardEvent) => {
			e.preventDefault()
			return Promise.resolve(LINK)
		}
	})
}))

const { useClipboard } = await import('../editor/clipboard.js')
type Embeds = Parameters<typeof useClipboard>[1]

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

async function pasteRef(embeds: Embeds) {
	const run = jest.fn()
	const ctx = { editor: { sel: { story: 'S', anchor: 0, head: 0 }, run }, doc: {} }
	function Probe() {
		useClipboard(ctx as never, embeds)
		return null
	}
	const root = createRoot(document.createElement('div'))
	await act(async () => root.render(<Probe />))
	const e = new Event('paste', { cancelable: true })
	Object.defineProperty(e, 'clipboardData', {
		value: { getData: (t: string) => (t === 'text/plain' ? 'cl:calcillo/a.tld:f1' : '') }
	})
	await act(async () => {
		document.dispatchEvent(e)
	})
	act(() => root.unmount())
	return { run, prevented: e.defaultPrevented }
}

describe('useClipboard cl: paste', () => {
	it('links the ref and inserts no text', async () => {
		const onLink = jest.fn((_l: unknown, _o: string) => {})
		const { run, prevented } = await pasteRef({ sourceFileId: 'src', onLink })
		expect(onLink).toHaveBeenCalledWith(LINK, 'a.tld')
		expect(run).not.toHaveBeenCalled()
		expect(prevented).toBe(true)
	})

	it('inserts nothing and does not link when canLink refuses', async () => {
		const onLink = jest.fn((_l: unknown, _o: string) => {})
		const { run, prevented } = await pasteRef({
			sourceFileId: 'src',
			onLink,
			canLink: () => false
		})
		expect(onLink).not.toHaveBeenCalled()
		expect(run).not.toHaveBeenCalled()
		expect(prevented).toBe(true)
	})
})

// vim: ts=4
