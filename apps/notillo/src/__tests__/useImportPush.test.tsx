// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { TextDecoder, TextEncoder } from 'node:util'
import type { RtdbClient } from '@cloudillo/rtdb'
import { jest } from '@jest/globals'
import * as React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

import { ROOT_PARENT } from '../rtdb/types.js'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
Object.assign(globalThis, { TextDecoder, TextEncoder })

interface Push {
	sourceMimeType: string
	fileName: string
	data: string
}

const bus = {
	access: 'write',
	push: undefined as ((payload: Push) => void) | undefined,
	onImportData(handler: (payload: Push) => void) {
		bus.push = handler
		return () => {
			bus.push = undefined
		}
	},
	notifyImportComplete: jest.fn<(success: boolean, error?: string) => void>()
}

/** A new function per language, as `useTranslation` gives. */
let t = (key: string) => key

const createPage = jest.fn<(...args: unknown[]) => Promise<string>>(async () => 'new')

const core = await import('@cloudillo/core')
const pageOps = await import('../rtdb/page-ops.js')

jest.unstable_mockModule('@cloudillo/core', () => ({ ...core, getAppBus: () => bus }))
jest.unstable_mockModule('react-i18next', () => ({ useTranslation: () => ({ t }) }))
jest.unstable_mockModule('../rtdb/page-ops.js', () => ({ ...pageOps, createPage }))

const { useImportPush } = await import('../hooks/useImportPush.js')

const FAILED = 'Could not import the file'

function setup() {
	const client = {} as RtdbClient
	const onCreated = jest.fn<(pageId: string, markdown: string) => void>()
	function Host() {
		useImportPush({ client, idTag: 'me.example', onCreated })
		return null
	}
	const root = createRoot(document.createElement('div'))
	const render = () => act(() => root.render(<Host />))
	render()
	return {
		onCreated,
		render,
		push: (data: string, sourceMimeType = 'text/markdown', fileName = 'Notes.md') =>
			act(async () => {
				bus.push?.({ sourceMimeType, fileName, data })
			}),
		unmount: () => act(() => root.unmount())
	}
}

describe('useImportPush', () => {
	let logged: ReturnType<typeof jest.spyOn>

	beforeEach(() => {
		bus.access = 'write'
		bus.notifyImportComplete.mockClear()
		createPage.mockClear()
		logged = jest.spyOn(console, 'error').mockImplementation(() => {})
	})

	afterEach(() => {
		logged.mockRestore()
	})

	it('refuses a push on a read-only bus', async () => {
		const s = setup()
		bus.access = 'read'

		await s.push(btoa('# a\n'))

		expect(createPage).not.toHaveBeenCalled()
		expect(bus.notifyImportComplete.mock.calls).toEqual([[false, 'Read-only document']])
		s.unmount()
	})

	it('refuses a wrong MIME type', async () => {
		const s = setup()

		await s.push(btoa('a'), 'text/plain')

		expect(createPage).not.toHaveBeenCalled()
		expect(bus.notifyImportComplete.mock.calls).toEqual([
			[false, 'Unsupported import type: {{type}}']
		])
		s.unmount()
	})

	it('reports invalid base64', async () => {
		const s = setup()

		await s.push('***')

		expect(createPage).not.toHaveBeenCalled()
		expect(bus.notifyImportComplete.mock.calls).toEqual([[false, FAILED]])
		s.unmount()
	})

	it('reports a page that cannot be created, without its error text', async () => {
		createPage.mockRejectedValueOnce(new Error('rtdb: internal detail'))
		const s = setup()

		await s.push(btoa('# a\n'))

		expect(s.onCreated).not.toHaveBeenCalled()
		expect(bus.notifyImportComplete.mock.calls).toEqual([[false, FAILED]])
		s.unmount()
	})

	it('creates a top-level page named after the file', async () => {
		const s = setup()

		await s.push(btoa('# a\n'))

		expect(createPage.mock.calls[0]?.slice(1)).toEqual(['me.example', 'Notes', ROOT_PARENT])
		expect(s.onCreated.mock.calls).toEqual([['new', '# a\n']])
		expect(bus.notifyImportComplete).not.toHaveBeenCalled()
		s.unmount()
	})

	it('creates one page when the language changes while it runs', async () => {
		let finish = (_id: string) => {}
		createPage.mockImplementationOnce(
			() =>
				new Promise<string>((resolve) => {
					finish = resolve
				})
		)
		const s = setup()

		await s.push(btoa('# a\n'))
		t = (key: string) => key
		s.render()
		await act(async () => finish('new'))

		expect(createPage).toHaveBeenCalledTimes(1)
		expect(s.onCreated.mock.calls).toEqual([['new', '# a\n']])
		s.unmount()
	})
})

// vim: ts=4
